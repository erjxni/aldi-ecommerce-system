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

---

## Syncing Upstream Changes & Resolving Conflicts

When changes are merged into `develop` or `main` via a Pull Request, collaborators need to sync their local branches. Follow this workflow to keep your branch up-to-date and clean:

### Step 1: Save Your Local Work
Before pulling, you must save your current uncommitted changes. You have two options:

#### Option A: Use Git Stash (Recommended for quick/unfinished work)
Stashing saves your changes to a temporary stack and cleans your working directory.
```bash
# Save your local changes
git stash

# Later, after pulling, bring them back:
git stash pop
```

#### Option B: Commit Your Work (Recommended if your changes are ready to be logged)
Create a temporary or WIP commit.
```bash
git add .
git commit -m "wip: working on feature X"
```

---

### Step 2: Pull and Integrate Upstream Changes
To keep your branch history clean and linear, use **Rebase** instead of Merge when updating your local feature branch. Rebasing plays your commits *on top* of the new incoming commits.

```bash
# 1. Fetch latest changes from remote
git fetch origin

# 2. Rebase your current feature branch onto the updated upstream branch (e.g., develop)
git pull --rebase origin develop
```
*(If you committed your work in Step 1, this will cleanly insert the new develop commits before your commits. If you stashed, pop your stash now: `git stash pop`)*.

---

### Step 3: Resolving Merge Conflicts
If someone edited the same lines of code as you, Git will pause and ask you to resolve conflicts.

#### 1. How to Read Conflicts
Git marks conflicts in the files like this:
```text
<<<<<<< HEAD
(New changes pulled from develop/main)
=======
(Your local changes that you're rebasing on top)
>>>>>>> your-commit-message
```

#### 2. The Conflict Mindset (How to think about what to merge)
*   **Don't guess — communicate**: If you aren't 100% sure what the other person's code does or why they wrote it, **ping them**! Ask: *"Hey, I see you changed how the DB connection is handled. Should I rewrite my query to use your new helper?"*
*   **Visual Editors**: Use VS Code's built-in Merge Editor (click "Resolve in Merge Editor" at the bottom right of a conflicted file in VS Code) to easily accept incoming, keep current, or combine both.
*   **Abort if stuck**: If you make a mistake during a rebase, you can always revert back to safety:
    ```bash
    git rebase --abort
    ```

#### 3. Proceeding after resolving conflicts
After fixing the conflicts in each file:
```bash
# Add the resolved files
git add <filename>

# Continue the rebase process (do NOT run git commit)
git rebase --continue
```
*(If you were popping a stash, you simply edit the conflicts, `git add`, and commit them as normal).*

---

### Step 4: Verify Semantic Merges (Crucial!)
Git only detects line-by-line conflicts. It does **not** understand code logic.
*   **Example**: If your colleague renamed `getUser()` to `fetchUser()` in `main`, and you added a new call to `getUser()` in your branch, Git will merge them with **zero conflicts**, but the application will crash.
*   **Action**: Always perform these checks after pulling/rebasing:
    1.  Re-run the server: `npm run dev` or equivalent.
    2.  Check for linting errors/warnings.
    3.  Run the tests to ensure everything still passes: `npm test`.

