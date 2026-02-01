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
            // Ensure there's always at least one block? 
            // Maybe not strictly required by core, but good practice for editor
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

            console.log(`Merging: Prev='${prevBlock.content}', Curr='${currBlock.content}'`);

            // Fix: contenteditable often leaves trailing \n. Trim it for cleaner merge.
            let safePrevContent = prevBlock.content.replace(/\n+$/, '');

            // Add a space if we are merging two non-empty text blocks (and prev doesn't already end in space)
            if (safePrevContent.length > 0 && currBlock.content.length > 0) {
                // Check if we need a space
                if (!safePrevContent.endsWith(' ')) {
                    safePrevContent += ' ';
                }
                prevBlock.content = safePrevContent + currBlock.content;
            } else {
                // If one was empty, just join (using the original maybe? No, safer to use trimmed)
                // Actually if prev was JUST \n, safePrev is empty.
                prevBlock.content = safePrevContent + currBlock.content;
            }

            // Remove current
            this.blocks.splice(currIndex, 1);
            return prevBlock.content;
        }
        return null;
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
            const right = content.slice(cursorIndex);

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
