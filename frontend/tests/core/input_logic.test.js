import { describe, it } from 'node:test';
import assert from 'node:assert';
import { determineCommand, COMMANDS } from '../../src/core/input_logic.js';

describe('Input Logic Commands', () => {


    it('should return NEW_BLOCK on Shift+Enter', () => {
        const event = { key: 'Enter', ctrlKey: false, shiftKey: true };
        assert.strictEqual(determineCommand(event), COMMANDS.NEW_BLOCK);
    });

    it('should return NONE on plain Enter (allow default newline)', () => {
        const event = { key: 'Enter', ctrlKey: false, shiftKey: false };
        assert.strictEqual(determineCommand(event), COMMANDS.NONE);
    });

    it('should return NAV_PREV on ArrowUp at start of block', () => {
        const event = { key: 'ArrowUp' };
        // We might need extra context like "isAtStart", but for now basic mapping
        // The simple determineCommand might just say "POTENTIAL_NAV_UP"
        assert.strictEqual(determineCommand(event), COMMANDS.NAV_UP);
    });

    it('should return NAV_NEXT on ArrowDown at end of block', () => {
        const event = { key: 'ArrowDown' };
        assert.strictEqual(determineCommand(event), COMMANDS.NAV_DOWN);
    });

    it('should return MERGE_BLOCK on Backspace', () => {
        const event = { key: 'Backspace' };
        assert.strictEqual(determineCommand(event), COMMANDS.MERGE_BLOCK);
    });

    it('should return EXIT_EDIT_MODE on Escape', () => {
        const event = { key: 'Escape' };
        assert.strictEqual(determineCommand(event), COMMANDS.EXIT_EDIT_MODE);
    });

    it('should return DELETE_BLOCK on Delete', () => {
        const event = { key: 'Delete' };
        assert.strictEqual(determineCommand(event), COMMANDS.DELETE_BLOCK);
    });
});
