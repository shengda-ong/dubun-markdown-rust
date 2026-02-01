import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { BlockManager } from '../../src/core/block_manager.js';

describe('BlockManager', () => {
    let manager;

    beforeEach(() => {
        manager = new BlockManager();
    });

    it('should initialize with no blocks', () => {
        assert.strictEqual(manager.getAllBlocks().length, 0);
    });

    it('init() should add a default paragraph block if empty', () => {
        manager.init();
        assert.strictEqual(manager.getAllBlocks().length, 1);
        assert.strictEqual(manager.getAllBlocks()[0].type, 'paragraph');
    });

    it('should add a new block at the end', () => {
        manager.addBlock('paragraph', 'Block 1');
        const block2 = manager.addBlock('heading', 'Block 2');

        const blocks = manager.getAllBlocks();
        assert.strictEqual(blocks.length, 2);
        assert.strictEqual(blocks[1].id, block2.id);
        assert.strictEqual(blocks[1].content, 'Block 2');
    });

    it('should insert a block after a specific block', () => {
        const b1 = manager.addBlock('paragraph', '1');
        const b3 = manager.addBlock('paragraph', '3');

        manager.addBlock('paragraph', '2', b1.id);

        const blocks = manager.getAllBlocks();
        assert.strictEqual(blocks.length, 3);
        assert.strictEqual(blocks[1].content, '2');
        assert.strictEqual(blocks[2].content, '3');
    });

    it('should delete a block by id', () => {
        const b1 = manager.addBlock('paragraph', '1');
        const b2 = manager.addBlock('paragraph', '2');
        manager.deleteBlock(b1.id);
        assert.strictEqual(manager.getAllBlocks().length, 1);
        assert.strictEqual(manager.getAllBlocks()[0].id, b2.id);
    });

    it('should ensure at least one block remains after deletion (business logic)', () => {
        const b1 = manager.addBlock('paragraph', '1');
        manager.deleteBlock(b1.id);

        // As per implementation in block_manager.js: deleteBlock re-adds a block if empty
        const blocks = manager.getAllBlocks();
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].content, '');
    });

    it('should retrieve a block by id', () => {
        const b1 = manager.addBlock('paragraph', 'test');
        const found = manager.getBlock(b1.id);
        assert.deepStrictEqual(found, b1);
    });

    it('should merge two blocks correctly', () => {
        const b1 = manager.addBlock('paragraph', 'Hello');
        const b2 = manager.addBlock('paragraph', 'World');

        manager.mergeBlocks(b1.id, b2.id);

        const blocks = manager.getAllBlocks();
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].content, 'Hello World');
        assert.strictEqual(blocks[0].id, b1.id);
    });
    it('should split a block into two', () => {
        const b1 = manager.addBlock('paragraph', 'Hello World');

        // Split at index 6 (before 'W')
        const newBlock = manager.splitBlock(b1.id, 6);

        const blocks = manager.getAllBlocks();
        assert.strictEqual(blocks.length, 2);
        assert.strictEqual(blocks[0].content, 'Hello ');
        assert.strictEqual(blocks[1].id, newBlock.id);
        assert.strictEqual(blocks[1].content, 'World');
    });
});
