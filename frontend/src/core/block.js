import { generateId } from '../utils/id_generator.js';

export class Block {
    /**
     * @param {string} type - 'paragraph', 'heading', 'list-item', etc.
     * @param {string} content - Raw markdown content
     */
    constructor(type = 'paragraph', content = '') {
        this.id = generateId();
        this.type = type;
        this.content = content;
        this.metadata = {}; // Extra data like heading level, list type etc.
    }
}
