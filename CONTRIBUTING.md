# Contributing to ArguSight

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. **Fork & clone** the repository
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Set up auth:**
   ```bash
   pnpm init-auth
   ```
4. **Configure servers** — copy and edit the example config:
   ```bash
   cp config/servers.example.json config/servers.json
   ```
5. **Start the dev server:**
   ```bash
   pnpm dev
   ```

## Branch Naming

- `feat/description` — new features
- `fix/description` — bug fixes
- `docs/description` — documentation changes
- `refactor/description` — code refactoring

## Commit Format

Use conventional commits:

```
feat: add GPU monitoring tab
fix: correct SSH reconnect backoff timing
docs: update README with Docker instructions
refactor: extract polling logic into hook
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `pnpm lint` and `pnpm build` pass
4. Open a PR against `main` with:
   - A clear description of what changed and why
   - Screenshots for UI changes
5. Wait for review

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling (use brand CSS variables)
- shadcn/ui for UI primitives
- pnpm for package management (never npm or yarn)

## Reporting Issues

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, browser)
