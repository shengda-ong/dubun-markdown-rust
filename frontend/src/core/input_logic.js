export const COMMANDS = {
    NONE: 'NONE',
    NEW_BLOCK: 'NEW_BLOCK',
    DELETE_BLOCK: 'DELETE_BLOCK',
    NAV_UP: 'NAV_UP',
    NAV_DOWN: 'NAV_DOWN',
    MERGE_BLOCK: 'MERGE_BLOCK',
    EXIT_EDIT_MODE: 'EXIT_EDIT_MODE',
    ENTER: 'ENTER'
};

/**
 * Determines the abstract command to execute based on a keyboard event.
 * @param {Object} event - The keyboard event (or mock)
 * @returns {string} One of COMMANDS
 */
export function determineCommand(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            return COMMANDS.NEW_BLOCK;
        }
        return COMMANDS.ENTER; // Capture Enter explicitly
    }

    if (event.key === 'ArrowUp') {
        return COMMANDS.NAV_UP;
    }

    if (event.key === 'ArrowDown') {
        return COMMANDS.NAV_DOWN;
    }

    if (event.key === 'Backspace') {
        return COMMANDS.MERGE_BLOCK; // View checks cursor position logic
    }

    if (event.key === 'Delete') {
        return COMMANDS.DELETE_BLOCK; // View checks "edit mode" logic
    }

    if (event.key === 'Escape') {
        return COMMANDS.EXIT_EDIT_MODE;
    }

    return COMMANDS.NONE;
}
