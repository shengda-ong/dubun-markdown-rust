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
        console.log(`Key: ${e.key}, Shift: ${e.shiftKey}, Ctrl: ${e.ctrlKey}, Command: ${command}`);

        if (command === COMMANDS.NEW_BLOCK) {
            e.preventDefault();

            // Save current content first
            component.saveContent();

            // Check for split vs new block
            const selection = window.getSelection();
            let newBlock;

            // If editing and we have a valid selection offset
            if (component.isEditing && selection.rangeCount > 0) {
                const offset = component.getCaretOffset();
                newBlock = this.blockManager.splitBlock(blockId, offset);

                // Update current block View (it was truncated)
                component.editorElement.innerText = component.block.content;
                component.switchToPreview();
                component.switchToEdit(); // Update view
            } else {
                newBlock = this.blockManager.addBlock('paragraph', '', blockId);
            }

            const index = this.blockManager.getBlockIndex(newBlock.id);
            const newComp = this.insertBlockComponent(newBlock, index);

            setTimeout(() => newComp.focusAtStart(), 10);

        } else if (command === COMMANDS.MERGE_BLOCK) {
            // Only merge if we are editing and at the start
            if (component.isEditing) {
                const selection = window.getSelection();
                console.log(`Merge Check: Offset=${selection.anchorOffset}, Collapsed=${selection.isCollapsed}, Type=${selection.type}`);

                // Basic check if cursor is at start (offset 0)
                if (selection.anchorOffset === 0 && selection.isCollapsed) {
                    const index = this.blockManager.getBlockIndex(blockId);
                    if (index > 0) {
                        e.preventDefault();
                        const prevBlock = this.blockManager.getAllBlocks()[index - 1];

                        // CRITICAL: Save current content before merging so we don't lose the text!
                        component.saveContent();

                        const prevLength = prevBlock.content.length; // Store length before merge

                        // Merge in data
                        this.blockManager.mergeBlocks(prevBlock.id, blockId);

                        // Update View
                        component.element.remove();
                        this.components.delete(blockId);

                        const prevComp = this.components.get(prevBlock.id);

                        // CRITICAL: Update the DOM element to reflect the merged model!
                        prevComp.editorElement.innerText = prevBlock.content;

                        prevComp.switchToPreview(); // Refresh content
                        prevComp.switchToEdit();   // Go back to edit

                        // Set cursor to join point
                        setTimeout(() => {
                            const range = document.createRange();
                            const sel = window.getSelection();
                            const textNode = prevComp.editorElement.firstChild;
                            if (textNode) {
                                try {
                                    range.setStart(textNode, prevLength);
                                    range.collapse(true);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                } catch (err) {
                                    console.warn("Cursor set failed", err);
                                    prevComp.focusAtEnd(); // Fallback
                                }
                            } else {
                                prevComp.focusAtEnd();
                            }
                        }, 0);
                    }
                }
            }
        } else if (command === COMMANDS.EXIT_EDIT_MODE) {
            e.preventDefault();
            component.focusPreview(); // Switch to "Navigation Mode"

        } else if (command === COMMANDS.DELETE_BLOCK) {
            // Only delete if NOT editing (Navigation Mode)
            if (!component.isEditing) {
                e.preventDefault();
                const index = this.blockManager.getBlockIndex(blockId);
                this.blockManager.deleteBlock(blockId);

                component.element.remove();
                this.components.delete(blockId);

                // Focus next or prev
                const blocks = this.blockManager.getAllBlocks();
                if (blocks.length > 0) {
                    // Try same index (next block moved up)
                    let nextBlock = blocks[index] || blocks[index - 1]; // Logic for "next" or "prev" if at end

                    if (nextBlock) {
                        let nextComp = this.components.get(nextBlock.id);

                        // Fix: If manager auto-generated a new block (e.g. we deleted the last one),
                        // it won't have a component yet. We must render it.
                        // Fix: If manager auto-generated a new block (e.g. we deleted the last one),
                        // it won't have a component yet. We must render it.
                        if (!nextComp) {
                            // If it's the only block, append it. 
                            this.renderBlock(nextBlock);
                            nextComp = this.components.get(nextBlock.id);

                            // CRITICAL: If we regenerated the block (editor was empty), 
                            // we should go straight to Edit Mode so user can type.
                            if (nextComp) {
                                nextComp.focusAtStart();
                            }
                        } else {
                            // Existing block, just navigate to it
                            nextComp.focusPreview();
                        }
                    }
                }
            }
        } else if (command === COMMANDS.NAV_UP) {
            // Logic for NAV_UP (check index etc)
            const index = this.blockManager.getBlockIndex(blockId);
            if (index > 0) {
                e.preventDefault(); // Prevent default if we are handling nav
                const prev = this.blockManager.getAllBlocks()[index - 1];
                this.components.get(prev.id).focusAtEnd();
            }
        } else if (command === COMMANDS.NAV_DOWN) {
            const index = this.blockManager.getBlockIndex(blockId);
            const blocks = this.blockManager.getAllBlocks();
            if (index < blocks.length - 1) {
                e.preventDefault();
                const next = blocks[index + 1];
                this.components.get(next.id).focusAtStart();
            }
        } else if (e.key === 'Backspace' && component.editorElement.innerText === '') {
            // Special case: Backspace still needs context check (empty text)
            // So we keep this check here or move it to determineCommand if we passed text 
            // but `determineCommand` is pure keyLogic currently.

            const blocks = this.blockManager.getAllBlocks();
            if (blocks.length > 1) {
                e.preventDefault();
                const index = this.blockManager.getBlockIndex(blockId);
                this.blockManager.deleteBlock(blockId);

                component.element.remove();
                this.components.delete(blockId);

                if (index - 1 >= 0) {
                    // Logic to focus previous block
                    const prev = this.blockManager.getAllBlocks()[index - 1];
                    // Note: blocks array was modified by deleteBlock, so we re-fetch or calc logic carefully.
                    // block_manager.deleteBlock acts in-place on this.blocks.
                    // If we removed item at `index`, then item at `index-1` is still at `index-1`.
                    this.components.get(prev.id).focusAtEnd();
                }
            }
        } else if (command === COMMANDS.ENTER) {
            // If in Navigation Mode (preview focused), Enter should switch to Edit Mode
            if (!component.isEditing) {
                e.preventDefault(); // Stop default (which might do nothing on div, but good practice)
                component.focusAtEnd();
            }
            // If isEditing, do nothing (allow default contenteditable Enter = new line)
        }
    }
}
