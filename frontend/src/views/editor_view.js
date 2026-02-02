import { BlockManager } from '../core/block_manager.js';
import { BlockComponent } from './block_component.js';
import { determineCommand, COMMANDS } from '../core/input_logic.js';

export class EditorView {
    constructor() {
        this.blockManager = new BlockManager();
        this.blockManager.init(); // ensure at least one block
        this.container = null;
        this.components = new Map(); // id -> BlockComponent
    }

    /**
     * Initialize the view in the given container
     * @param {HTMLElement} rootElement 
     */
    init(rootElement) {
        // Find the specific editor container defined in editor.html
        this.container = rootElement.querySelector('.editor-container');
        if (!this.container) {
            console.error("Editor container not found");
            return;
        }

        // Clear existing static content
        this.container.innerHTML = '';
        this.container.classList.add('block-editor-mode');

        this.render();
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';
        this.components.clear();

        const blocks = this.blockManager.getAllBlocks();
        blocks.forEach(block => {
            this.renderBlock(block);
        });

        // Auto-focus first block
        if (blocks.length > 0) {
            const firstBlockId = blocks[0].id;
            setTimeout(() => {
                const comp = this.components.get(firstBlockId);
                if (comp) comp.focusAtStart();
            }, 100);
        }
    }

    renderBlock(block) {
        const component = new BlockComponent(block, {
            onUpdate: (updatedBlock) => {
                // State is mutable/shared, so already updated in memory
                // If we had a store, we would dispatch specific update
            },
            onFocus: (id) => {
                this.blockManager.focusedBlockId = id;
            },
            onBlur: (id) => {
                if (this.blockManager.focusedBlockId === id) {
                    this.blockManager.focusedBlockId = null;
                }
            },
            onKeyDown: (e, id, componentInstance) => {
                this.handleKeyDown(e, id, componentInstance);
            }
        });

        const element = component.render();
        this.container.appendChild(element);
        this.components.set(block.id, component);
    }

    // Insert a new block in DOM at correct index
    insertBlockComponent(block, index) {
        const component = new BlockComponent(block, {
            onUpdate: () => { },
            onFocus: (id) => this.blockManager.focusedBlockId = id,
            onBlur: () => { }, // simple logic
            onKeyDown: (e, id, comp) => this.handleKeyDown(e, id, comp)
        });
        const element = component.render();
        const referenceNode = this.container.children[index];
        this.container.insertBefore(element, referenceNode); // if ref is null, appends to end
        this.components.set(block.id, component);
        return component;
    }

    handleKeyDown(e, blockId, component) {
        // Debugging Key Events for User
        const command = determineCommand(e);

        switch (command) {
            case COMMANDS.NEW_BLOCK:
                this.handleNewBlock(e, blockId, component);
                break;
            case COMMANDS.MERGE_BLOCK:
                this.handleMergeBlock(e, blockId, component);
                break;
            case COMMANDS.EXIT_EDIT_MODE:
                this.handleExitEditMode(e, blockId, component);
                break;
            case COMMANDS.DELETE_BLOCK:
                this.handleDeleteBlock(e, blockId, component);
                break;
            case COMMANDS.NAV_UP:
                this.handleNavigation(e, blockId, -1);
                break;
            case COMMANDS.NAV_DOWN:
                this.handleNavigation(e, blockId, 1);
                break;
            case COMMANDS.ENTER:
                this.handleEnter(e, blockId, component);
                break;
            default:
                break;
        }
    }

    /* --- Command Handlers --- */

    handleNewBlock(e, blockId, component) {
        e.preventDefault();
        component.saveContent(); // Save state before splitting

        const selection = window.getSelection();
        let newBlock;

        // Split if editing mid-text, otherwise append new empty block
        if (component.isEditing && selection.rangeCount > 0) {
            const offset = component.getCaretOffset();
            newBlock = this.blockManager.splitBlock(blockId, offset);

            component.editorElement.innerText = component.block.content; // Update view
            component.switchToPreview();
            component.switchToEdit();
        } else {
            newBlock = this.blockManager.addBlock('paragraph', '', blockId);
        }

        const index = this.blockManager.getBlockIndex(newBlock.id);
        const newComp = this.insertBlockComponent(newBlock, index);

        setTimeout(() => newComp.focusAtStart(), 10);
    }

    handleMergeBlock(e, blockId, component) {
        if (component.isEditing) {
            const selection = window.getSelection();
            // Merge into previous block if cursor is at the start
            if (selection.anchorOffset === 0 && selection.isCollapsed) {
                this._performMerge(e, blockId, component);
            }
        }
    }

    /**
     * Shared merge logic
     */
    _performMerge(e, blockId, component) {
        const index = this.blockManager.getBlockIndex(blockId);
        if (index > 0) {
            e.preventDefault();
            const prevBlock = this.blockManager.getAllBlocks()[index - 1];

            // CRITICAL: Save current content
            component.saveContent();
            const prevLength = prevBlock.content.length;

            // Merge
            this.blockManager.mergeBlocks(prevBlock.id, blockId);

            // Update Logic
            component.element.remove();
            this.components.delete(blockId);

            const prevComp = this.components.get(prevBlock.id);
            prevComp.editorElement.innerText = prevBlock.content; // Sync DOM
            prevComp.switchToPreview();
            prevComp.switchToEdit();

            // Restore Cursor
            setTimeout(() => {
                this._setCursor(prevComp, prevLength);
            }, 0);
        }
    }

    handleExitEditMode(e, blockId, component) {
        e.preventDefault();
        component.focusPreview();
    }

    handleDeleteBlock(e, blockId, component) {
        // Only delete if NOT editing
        if (!component.isEditing) {
            e.preventDefault();
            this._deleteBlockAndFocus(blockId, component);
        }
    }

    handleNavigation(e, blockId, direction) {
        // direction: -1 (UP), 1 (DOWN)
        const index = this.blockManager.getBlockIndex(blockId);
        const blocks = this.blockManager.getAllBlocks();
        const targetIndex = index + direction;

        if (targetIndex >= 0 && targetIndex < blocks.length) {
            e.preventDefault();
            const targetBlock = blocks[targetIndex];
            const targetComp = this.components.get(targetBlock.id);

            if (direction === -1) targetComp.focusAtEnd();
            else targetComp.focusAtStart();
        }
    }

    handleEnter(e, blockId, component) {
        if (!component.isEditing) {
            e.preventDefault();
            component.focusAtEnd();
        }
    }

    /* --- Helpers --- */

    _deleteBlockAndFocus(blockId, component) {
        const index = this.blockManager.getBlockIndex(blockId);
        this.blockManager.deleteBlock(blockId);

        component.element.remove();
        this.components.delete(blockId);

        // Focus next or prev
        const blocks = this.blockManager.getAllBlocks();
        if (blocks.length > 0) {
            let nextBlock = blocks[index] || blocks[index - 1];
            if (nextBlock) {
                let nextComp = this.components.get(nextBlock.id);
                // If new block was auto-generated by manager
                if (!nextComp) {
                    this.renderBlock(nextBlock);
                    nextComp = this.components.get(nextBlock.id);
                    if (nextComp) nextComp.focusAtStart();
                } else {
                    nextComp.focusPreview();
                }
            }
        }
    }

    _setCursor(component, offset) {
        const range = document.createRange();
        const sel = window.getSelection();
        const textNode = component.editorElement.firstChild;
        if (textNode) {
            try {
                range.setStart(textNode, offset);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (err) {
                component.focusAtEnd();
            }
        } else {
            component.focusAtEnd();
        }
    }
}
