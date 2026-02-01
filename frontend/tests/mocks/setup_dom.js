// Minimal DOM Mock for Node.js Testing

export function setupDomMock() {
    global.window = {
        getSelection: () => ({
            anchorOffset: 0,
            isCollapsed: true,
            rangeCount: 0,
            getRangeAt: () => ({
                cloneRange: () => ({
                    selectNodeContents: () => { },
                    setEnd: () => { },
                    toString: () => '' // Mock behavior needed for specific tests?
                }),
                startContainer: {},
                startOffset: 0
            }),
            removeAllRanges: () => { },
            addRange: () => { },
            type: 'Caret'
        }),
        setTimeout: (cb, ms) => cb() // Run immediately for tests
    };

    global.document = {
        createElement: (tag) => {
            return {
                tagName: tag.toUpperCase(),
                className: '',
                style: {},
                classList: {
                    add: () => { },
                    remove: () => { }
                },
                dataset: {},
                children: [],
                appendChild: function (child) { this.children.push(child); },
                insertBefore: function (child) { this.children.push(child); }, // Simplified
                remove: function () { },
                addEventListener: () => { },
                querySelector: () => ({}),
                focus: () => { },
                innerText: '',
                innerHTML: '',
                firstChild: {} // simplified
            };
        },
        createRange: () => ({
            setStart: () => { },
            collapse: () => { },
            selectNodeContents: () => { },
            cloneRange: () => ({
                selectNodeContents: () => { },
                setEnd: () => { },
                toString: () => ''
            })
        })
    };

    global.HTMLElement = class { };
    global.Event = class { };
    global.KeyboardEvent = class {
        constructor(type, opts) {
            this.key = opts.key;
            this.shiftKey = opts.shiftKey;
            this.ctrlKey = opts.ctrlKey;
            this.altKey = opts.altKey;
            this.preventDefault = () => { };
        }
    };
}
