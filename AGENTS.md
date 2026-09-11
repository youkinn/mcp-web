# mcp-web — Project Conventions

## Tech Stack
- Vue 3 (Composition API, `<script setup>`)
- Ant Design Vue
- Less (global styles in `src/style.less`)
- Pinia (state management)
- Vite (build tool, proxy `/api` → `http://localhost:3000`)

## Code Style
- Component order: `<template>` → `<script>` → `<style scoped>`
- Page-specific styles live in the `.vue` file, not in `style.less`
- `style.less` contains only: global resets, shared styles (site-header, brand, etc.), and HomeView-specific styles
- Use CSS values directly in scoped styles (no Less variable imports)

## File Structure
```
src/
├── api/          API client layer
├── stores/       Pinia stores
├── views/        Page-level components
├── style.less    Global & shared styles
```

## Owner: 小叶

## Workflow (per feat-A001)

1. Read `dev-docs/requirements/feat-A001-xxx.md`
2. Read 老陈's API doc at `dev-docs/mcp-orchestrator/api/feat-A001-xxx.md`
3. Read `dev-docs/mcp-orchestrator/api/response-convention.md`
4. Write half-page tech design → `dev-docs/mcp-web/design/feat-A001-xxx.md`
5. Wait for Coco to confirm API doc is ready before coding
6. Implement frontend changes
7. Write tests (clear naming, covers acceptance criteria)

### API client convention
- All responses use `{ code, data, message }` envelope
- Frontend checks `res.code === 200` for success, shows `res.message` on error
- Distinguished handling per status code: 413 (truncate), 503 (service down), 500 (retry)

## Delivery Checklist
- [ ] Code compiles (`npm run build` or `vite build`)
- [ ] Design doc written (half-page, design/feat-A001-xxx.md)
- [ ] Test code written (clear naming, covers acceptance criteria)
- [ ] API client uses `{ code, data, message }` envelope
- [ ] Docs in `dev-docs/` are up to date
- [ ] Template / script / style order maintained
- [ ] No styles leaked to `style.less` unless shared


## Git
- Always work on a branch: ` feat/feat-A001-name ` or ` fix/bug-00042-name ` 
- Never commit directly to main
- Commit format: ` #feat-A001 type: 中文描述 `


