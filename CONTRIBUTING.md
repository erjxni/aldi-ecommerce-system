# Contributing Guide — Aldi E-Commerce System

## Branch Merge Order
feature/branch → develop → main

## Workflow
1. Create a feature branch from develop:
   git checkout develop
   git checkout -b feature/your-feature-name

2. Work on your feature and commit regularly:
   git add .
   git commit -m "Description of changes"

3. Push your feature branch:
   git push origin feature/your-feature-name

4. Open a Pull Request into develop on GitHub

5. Wait for at least 1 team member to review and approve

6. Once approved, merge into develop

7. develop merges into main only at end of sprint when stable

## Rules
- Never push directly to main
- Never push directly to develop
- All merges must go through a Pull Request
- At least 1 approval required before merging
