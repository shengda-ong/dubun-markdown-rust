import { Block } from './block.js';

export class BlockManager {
    constructor() {
        this.blocks = [];
        this.focusedBlockId = null;
    }

    /**
     * Initialize with a default block if empty
     */
    init() {
        if (this.blocks.length === 0) {
            this.addBlock('paragraph', '');
        }
    }

    /**
     * Add a new block
     * @param {string} type 
     * @param {string} content 
     * @param {string|null} afterBlockId - ID of block to insert after. If null, appends to end.
     * @returns {Block} The created block
     */
    addBlock(type, content, afterBlockId = null) {
        const newBlock = new Block(type, content);

        if (afterBlockId) {
            const index = this.blocks.findIndex(b => b.id === afterBlockId);
            if (index !== -1) {
                this.blocks.splice(index + 1, 0, newBlock);
            } else {
                this.blocks.push(newBlock);
            }
        } else {
            this.blocks.push(newBlock);
        }

        return newBlock;
    }

    /**
     * Delete a block by ID
     * @param {string} id 
     * @returns {boolean} true if deleted
     */
    deleteBlock(id) {
        const index = this.blocks.findIndex(b => b.id === id);
        if (index !== -1) {
            this.blocks.splice(index, 1);
            // Ensure at least one block remains
            if (this.blocks.length === 0) {
                this.addBlock('paragraph', '');
            }
            return true;
        }
        return false;
    }

    /**
     * Merge current block into previous block
     * @param {string} prevId 
     * @param {string} currentId 
     * @returns {string|null} merged content (or boolean success)
     */
    mergeBlocks(prevId, currentId) {
        const prevIndex = this.blocks.findIndex(b => b.id === prevId);
        const currIndex = this.blocks.findIndex(b => b.id === currentId);

        if (prevIndex !== -1 && currIndex !== -1) {
            const prevBlock = this.blocks[prevIndex];
            const currBlock = this.blocks[currIndex];

            // Update previous block's content
            prevBlock.content = this.computeMergedContent(prevBlock.content, currBlock.content);

            // Remove current
            this.blocks.splice(currIndex, 1);
            return prevBlock.content;
        }
        return null;
    }

    /**
     * Helper to compute the result of merging two block contents.
     * Handles newline trimming and smart spacing.
     * @param {string} prevContent 
     * @param {string} currContent 
     * @returns {string}
     */
    computeMergedContent(prevContent, currContent) {
        // Trim trailing newlines from previous content
        let safePrevContent = prevContent.replace(/\n+$/, '');

        // Add a space if we are merging two non-empty text blocks
        if (safePrevContent.length > 0 && currContent.length > 0) {
            if (!safePrevContent.endsWith(' ')) {
                safePrevContent += ' ';
            }
        }

        return safePrevContent + currContent;
    }

    /**
     * Split a block at a specific cursor index
     * @param {string} id 
     * @param {number} cursorIndex 
     * @returns {Block|null} The new block created from the split part
     */
    splitBlock(id, cursorIndex) {
        const index = this.blocks.findIndex(b => b.id === id);
        if (index !== -1) {
            const block = this.blocks[index];
            const content = block.content;

            const left = content.slice(0, cursorIndex);
            const right = content.slice(cursorIndex).trimStart();

            block.content = left;

            // Create new block after current
            return this.addBlock(block.type, right, block.id);
        }
        return null;
    }

    /**
     * Get a block by ID
     * @param {string} id 
     * @returns {Block|undefined}
     */
    getBlock(id) {
        return this.blocks.find(b => b.id === id);
    }

    /**
     * Get the index of a block
     * @param {string} id 
     * @returns {number}
     */
    getBlockIndex(id) {
        return this.blocks.findIndex(b => b.id === id);
    }

    getAllBlocks() {
        return this.blocks;
    }
}
