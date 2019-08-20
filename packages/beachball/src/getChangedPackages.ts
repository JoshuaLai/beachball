import { ChangeInfo } from './ChangeInfo';
import { findPackageRoot, getChangePath } from './paths';
import { getChanges, git, fetchAll } from './git';
import fs from 'fs';
import path from 'path';

/**
 * Gets all the changed packages, regardless of the change files
 * @param cwd
 */
function getAllChangedPackages(branch: string, cwd: string) {
  const changes = getChanges(branch, cwd);

  const packageRoots: { [pathName: string]: string } = {};
  if (changes) {
    // Discover package roots from modded files
    changes.forEach(moddedFile => {
      const root = findPackageRoot(path.join(cwd, path.dirname(moddedFile)));

      if (root && !packageRoots[root]) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json')).toString());

          if (!packageJson.private && (!packageJson.beachball || packageJson.beachball.shouldPublish !== false)) {
            const packageName = packageJson.name;
            packageRoots[root] = packageName;
          }
        } catch (e) {
          // Ignore JSON errors
        }
      }
    });
  }

  return Object.values(packageRoots);
}

/**
 * Gets all the changed packages, accounting for change files
 * @param cwd
 */
export function getChangedPackages(branch: string, cwd: string, fetch: boolean) {
  const changePath = getChangePath(cwd);

  if (fetch) {
    console.log('fetching latest from remotes');
    fetchAll(cwd);
  }

  const changedPackages = getAllChangedPackages(branch, cwd);

  const changeFilesResult = git(['diff', '--name-only', '--no-renames', '--diff-filter=A', `${branch}...`], { cwd });

  if (!changePath || !fs.existsSync(changePath) || !changeFilesResult.success) {
    return changedPackages;
  }

  const changes = changeFilesResult.stdout.split(/\n/);
  const changeFiles = changes.filter(name => path.dirname(name) === 'change');
  const changeFilePackageSet = new Set<string>();

  // Loop through the change files, building up a set of packages that we can skip
  changeFiles.forEach(file => {
    try {
      const changeInfo: ChangeInfo = JSON.parse(fs.readFileSync(file, 'utf-8'));
      changeFilePackageSet.add(changeInfo.packageName);
    } catch (e) {
      console.warn(`Invalid change file encountered: ${file}`);
    }
  });

  if (changeFilePackageSet.size > 0) {
    console.log(`Your local repository already has change files for these packages: ${[...changeFilePackageSet].sort().join(', ')}`);
  }

  return changedPackages.filter(pkgName => !changeFilePackageSet.has(pkgName));
}
