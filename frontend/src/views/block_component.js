import { parseMarkdown } from '../core/parser.js';

export class BlockComponent {
    /**
     * @param {Object} block - The block data object
     * @param {Object} callbacks - { onUpdate, onFocus, onBlur, onKeyDown }
     */
    constructor(block, callbacks) {
        this.block = block;
        this.callbacks = callbacks;
        this.element = null;
        this.editorElement = null;
        this.previewElement = null;
        this.isEditing = false;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'block-wrapper';
        this.element.dataset.id = this.block.id;

        // Preview Mode (Default)
        this.previewElement = document.createElement('div');
        this.previewElement.className = `block-preview block-type-${this.block.type}`;
        this.previewElement.innerHTML = this.block.content ? parseMarkdown(this.block.content) : '';
        this.previewElement.tabIndex = 0; // Enable focus for Navigation Mode

        // Edit Mode (Hidden initially)
        this.editorElement = document.createElement('div');
        this.editorElement.className = `block-editor block-type-${this.block.type}`;
        this.editorElement.contentEditable = true;
        this.editorElement.innerText = this.block.content; // Raw text
        this.editorElement.style.display = 'none';

        // Events
        this.previewElement.addEventListener('click', (e) => {
            if (!this.isEditing) {
                this.switchToEdit();
                if (this.callbacks.onFocus) this.callbacks.onFocus(this.block.id);
            }
        });

        this.previewElement.addEventListener('keydown', (e) => {
            // Allow processing keys even in Preview mode (e.g. Delete, Arrows, Enter)
            if (this.callbacks.onKeyDown) {
                this.callbacks.onKeyDown(e, this.block.id, this);
            }
        });

        this.editorElement.addEventListener('blur', (e) => {
            this.saveContent();
            this.switchToPreview();
            if (this.callbacks.onBlur) this.callbacks.onBlur(this.block.id);
        });

        this.editorElement.addEventListener('keydown', (e) => {
            if (this.callbacks.onKeyDown) {
                this.callbacks.onKeyDown(e, this.block.id, this);
            }
        });

        this.editorElement.addEventListener('input', (e) => {
        });

        this.element.appendChild(this.previewElement);
        this.element.appendChild(this.editorElement);

        return this.element;
    }

    switchToEdit() {
        this.isEditing = true;
        this.element.classList.add('focused');
        this.previewElement.style.display = 'none';
        this.editorElement.style.display = 'block';
        this.editorElement.focus();
        // Cursor placement logic could go here (end of line usually)
    }

    switchToPreview() {
        this.isEditing = false;
        this.element.classList.remove('focused');
        this.editorElement.style.display = 'none';
        this.previewElement.innerHTML = this.block.content ? parseMarkdown(this.block.content) : '';
        this.previewElement.style.display = 'block';
    }

    saveContent() {
        if (this.editorElement) {
            // Trim hidden characters (like \n) added by browsers in contenteditable
            this.block.content = this.editorElement.innerText.trim();
        }
        if (this.callbacks.onUpdate) {
            this.callbacks.onUpdate(this.block);
        }
    }

    focusAtStart() {
        this.switchToEdit();

        // Force cursor to start
        const range = document.createRange();
        const sel = window.getSelection();

        // Text node might be missing if empty
        if (this.editorElement.firstChild) {
            range.setStart(this.editorElement.firstChild, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            // If empty, simple focus works
            this.editorElement.focus();
        }
    }

    focusAtEnd() {
        this.switchToEdit();

        const range = document.createRange();
        const sel = window.getSelection();

        if (this.editorElement.firstChild) {
            range.selectNodeContents(this.editorElement);
            range.collapse(false); // false = to end
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            this.editorElement.focus();
        }
    }

    focusPreview() {
        this.switchToPreview();
        this.previewElement.focus();
    }
    getCaretOffset() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;

        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(this.editorElement);
        preCaretRange.setEnd(range.startContainer, range.startOffset);

        return preCaretRange.toString().length;
    }
}
