# implementation_plan.md

# Editor Implementation Plan: The "Architect Layout"

This plan outlines the steps to transform the current simple editor into the "Architect Layout" as designed. We will prioritize the **Structural Blueprint** and **Basic Markdown Syntax** support first, ensuring a solid baseline before adding advanced features like the Command Palette or Focus Mode.

## Goal
Create a professional, three-column markdown editor with a "Markdown-First" experience, supporting standard syntax and a responsive layout.

## Phase 1: Structural Blueprint (The Skeleton)
**Objective:** Implement the layout and static UI components.

- **Layout Architecture**
    - Implement a **CSS Grid / Flexbox** layout for the `app-container`.
    - **Header**: Top bar for Breadcrumbs and Toolbar.
    - **Main Body**: Three-column system.
        - **Left Sidebar (Library)**: Collapsible, fixed width (e.g., 250px).
        - **Center Canvas (Editor)**: Fluid width, max-width 800px, centered.
        - **Right Sidebar (Outline)**: Collapsible, fixed width (e.g., 200px).

- **Component Implementation** (HTML/CSS structure in `editor.html` & `editor.css`)
    - **Breadcrumb Header**: Interactive path navigation (e.g., `Documents > Projects > Draft.md`).
    - **File Tree**: Placeholder structure for folders and files.
    - **Table of Contents**: Placeholder structure for H1-H3 links.
    - **Editor Area**: The main typing surface.

## Phase 2: Basic Markdown Engine (The Core)
**Objective:** Ensure standard markdown syntax works as expected.

- **Input Handling**
    - Implement the text input mechanism (Textarea or `contenteditable`).
    - *Decision needed*: Pure text + Preview VS Hybrid Editor (Hide syntax on blur)?
    - *Recommendation*: Start with **Raw Text + Live Preview** or a simple **Hybrid** approach where syntax remains visible but styled (e.g., `**bold**` is actually bold).

- **Syntax Support (Baseline)**
    - Implement parsing and styling for:
        - [x] Headings (H1-H6)
        - [x] Paragraphs & Line Breaks
        - [x] Emphasis (**Bold**, *Italic*)
        - [x] Lists (Ordered & Unordered)
        - [x] Blockquotes
        - [x] Code Blocks (Functionality first, syntax highlighting later)
        - [x] Horizontal Rules
        - [x] Links & Images

## Phase 3: The "Clicker" Path (Basic UI)
**Objective:** Add mouse-driven controls.

- **Toolbar Interaction**
    - Implement persistent icons for generic formatting (Bold, Italic, List, Header).
    - Connect toolbar buttons to text insertion logic in the editor.

## Phase 4: Future Polish (Post-MVP)
*These will be tackled after the baseline is solid.*
- **Command Palette (`Ctrl+K`)**: Fuzzy search for commands.
- **Slash Commands (`/`)**: Inline block insertion.
- **Focus Mode (`F11`)**: Distraction-free toggle.
- **Typewriter Scrolling**: keep cursor centered.

## Next Step
We will begin with **Phase 1: Structural Blueprint** to get the layout working.
