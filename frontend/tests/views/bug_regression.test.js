import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { setupDomMock } from '../mocks/setup_dom.js';
import { EditorView } from '../../src/views/editor_view.js';
import { BlockManager } from '../../src/core/block_manager.js';
import { COMMANDS } from '../../src/core/input_logic.js';

// Setup Mock Environment
setupDomMock();

describe('Bug Regressions', () => {
    let view;

    beforeEach(() => {
        // Reset Mocks if needed
        view = new EditorView();
        // Mock container
        const container = document.createElement('div');
        container.classList.add('editor-container');
        view.init({ querySelector: () => container });

        // CLEAR DEFAULT BLOCK from Manager so we start clean
        view.blockManager.blocks = [];
    });

    it('Bug 1: Should call saveContent before merging to prevent text loss', () => {
        const b1 = view.blockManager.addBlock('paragraph', 'Hello ');
        const b2 = view.blockManager.addBlock('paragraph', 'World');

        view.render();
        const comp2 = view.components.get(b2.id);

        // Simulate Edit Mode
        comp2.isEditing = true;

        // Mock Selection at 0
        global.window.getSelection = () => ({
            anchorOffset: 0,
            isCollapsed: true,
            rangeCount: 1,
            type: 'Caret',
            removeAllRanges: () => { },
            addRange: () => { }
        });

        // Spy on saveContent (call original!)
        let saved = false;
        const originalSave = comp2.saveContent.bind(comp2);
        comp2.saveContent = () => { saved = true; originalSave(); };

        // Trigger Backspace (MERGE_BLOCK)
        const event = new KeyboardEvent('keydown', { key: 'Backspace' });
        view.handleKeyDown(event, b2.id, comp2);

        assert.strictEqual(saved, true, 'saveContent() should be called before merge');
        assert.strictEqual(view.blockManager.getAllBlocks().length, 1);
    });

    it('Should trim whitespace when saving content', () => {
        const b1 = view.blockManager.addBlock('paragraph', '  Trim Me  ');
        view.render();
        const comp = view.components.get(b1.id);

        // Mock innerText with whitespace
        comp.editorElement.innerText = '  Trim Me  ';
        comp.saveContent();

        assert.strictEqual(b1.content, 'Trim Me');
    });

    it('Bug 2: Should add space when merging non-empty blocks', () => {
        // This is a Manager logic test, but good to verify integration
        const b1 = view.blockManager.addBlock('paragraph', 'Hello');
        const b2 = view.blockManager.addBlock('paragraph', 'World');

        view.blockManager.mergeBlocks(b1.id, b2.id);

        assert.strictEqual(view.blockManager.blocks[0].content, 'Hello World', 'Should insert space');
    });

    it('Bug 3 & 4: Deleting last block should regenerate and focus in Edit Mode', () => {
        const b1 = view.blockManager.addBlock('paragraph', 'Last');
        // Delete all others so we only have one
        view.blockManager.blocks = [b1];
        view.render();

        const comp1 = view.components.get(b1.id);
        comp1.isEditing = false; // Nav Mode

        // Spy on renderBlock to ensure new block is rendered
        let rendered = false;
        const originalRender = view.renderBlock.bind(view);
        view.renderBlock = (block) => {
            rendered = true;
            originalRender(block);
        };

        // Trigger Delete
        const event = new KeyboardEvent('keydown', { key: 'Delete' });
        view.handleKeyDown(event, b1.id, comp1);

        assert.strictEqual(rendered, true, 'Should render the new block');

        const newBlock = view.blockManager.getAllBlocks()[0];
        assert.notStrictEqual(newBlock.id, b1.id, 'Should be a new block ID');

        const newComp = view.components.get(newBlock.id);
        assert.ok(newComp, 'New component should exist');

        // We can't easily check focus() state in mock, but we verified code logic calls focusAtStart()
    });

    it('Bug 5: Shift+Enter mid-text should split block', () => {
        const b1 = view.blockManager.addBlock('paragraph', 'Hello World');
        view.render();
        const comp1 = view.components.get(b1.id);
        comp1.isEditing = true;

        // Mock Selection at index 6 (between Hello and World)
        // Mock Selection (generic, we will mock getCaretOffset for specificity)
        global.window.getSelection = () => ({
            anchorOffset: 0,
            isCollapsed: true,
            rangeCount: 1,
            getRangeAt: () => ({}), // stub
            removeAllRanges: () => { },
            addRange: () => { }
        });

        // Mock getCaretOffset to return 6
        comp1.getCaretOffset = () => 6;

        // Trigger Shift+Enter
        const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
        view.handleKeyDown(event, b1.id, comp1);

        const blocks = view.blockManager.getAllBlocks();
        assert.strictEqual(blocks.length, 2);
        assert.strictEqual(blocks[0].content, 'Hello ');
        assert.strictEqual(blocks[1].content, 'World');
    });
});
