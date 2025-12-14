# DApp (Vite + React)

## What is Vite?

Vite is a modern frontend build tool that provides a fast and optimized development experience. It uses native ES modules in the browser for development and bundles the code using Rollup for production. Vite is known for its lightning-fast startup time and efficient hot module replacement (HMR), making it ideal for modern web development.

## Why are we using Vite?

We are using Vite in this project because:

1. **Fast Development**: Vite's instant server start and HMR ensure a smooth and efficient development workflow.
2. **Optimized Build**: Vite produces highly optimized production builds using Rollup.
3. **Modern Features**: It supports modern JavaScript and TypeScript out of the box, making it easy to work with cutting-edge tools and frameworks.
4. **Simplicity**: Vite's configuration is straightforward, reducing the complexity of setting up a development environment.

## Usage

1. Go to [Reown Cloud](https://cloud.reown.com) and create a new project.
2. Copy your `Project ID`
3. Rename `.env.example` to `.env` and paste your `Project ID` as the value for `VITE_PROJECT_ID`
4. Run `pnpm install` to install dependencies
5. Run `pnpm run dev` to start the development server

## Resources

- [Reown — Docs](https://docs.reown.com)
- [Vite — GitHub](https://github.com/vitejs/vite)
- [Vite — Docs](https://vitejs.dev/guide/)

---

## 🔧 Git Workflow & Contribution Rules

### 📂 Branch Naming Convention

Branches must follow these formats:

- `feature/TT-1-add-login-page` — for new features
- `bugfix/TT-1-fix-login-bug` — for bug fixes

> `TT-1` = task/ticket ID from your board (e.g. Jira, Linear)

### ✅ Pull Request Naming

Follow this PR title structure:

- `Feature/TT-1: Add login page`
- `Bugfix/TT-2: Fix auth bug`

### ✅ Pull Request Process

- PRs must target the `dev` branch
- Include a link to the related task in the description
- Change the task status to **"Review In Progress"**
- At least **2 reviewers**: one Tech Lead + one Developer
- Merge only after all CI checks pass

### ✅ Commit Message Format (Conventional Commits)

We use the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard:


#### Valid `<type>` values:

- `feat` – new feature
- `fix` – bug fix
- `docs` – documentation
- `style` – formatting only
- `refactor` – code restructure
- `test` – testing only
- `chore` – tooling, build, infra

#### Examples:

```sh
feat: add new login page
fix(auth): fix login validation error
docs: update API section in README
style: format code with Prettier
```

### ✅ Commit Linting
Commits are automatically checked using commitlint and husky. Invalid messages will be rejected.

### ✅ Branch Name Linting
A GitHub Action checks PR branch names match the required format (feature/TT-1-something, etc). Invalid names will fail CI.
