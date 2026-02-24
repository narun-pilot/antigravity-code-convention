# Antigravity Code Review Extension

Secure code and convention check.

This extension provides a quick way to request code reviews from the Antigravity AI Agent, following the Morakot coding conventions.

## Features

- **Request Code Review**: Automatically gathers Git diff information and prepares a review request for the AI Agent.
- **Morakot Convention Integration**: References the `code-review-skill` and the Morakot Python Style Guide.

## How to Use

1. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux).
2. Type **"Antigravity: Request Code Review"**.
3. Follow the prompts to describe what you implemented.
4. A `code-review-request.md` file will be generated and opened.
5. Notify the Antigravity Agent to start the review based on this file.

## Requirements

- Git must be initialized in the workspace.
- Antigravity IDE (or VS Code).

## Installation for Development

1. Open this folder in Antigravity/VS Code.
2. Run `npm install`.
3. Press `F5` to open a New Window with the extension loaded.

---
Created by Antigravity AI Assistant
