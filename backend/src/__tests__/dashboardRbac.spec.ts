import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

type PolicyRule = {
  apiGroups?: string[];
  resources?: string[];
  verbs?: string[];
};

type RbacManifest = {
  rules?: PolicyRule[];
};

const loadManifest = (relativePath: string): RbacManifest =>
  yaml.load(
    fs.readFileSync(path.resolve(__dirname, '../../../', relativePath), 'utf8'),
  ) as RbacManifest;

describe('dashboard service-account RBAC', () => {
  it('does not grant cluster-wide access to sensitive or RBAC-management resources', () => {
    const clusterRole = loadManifest('manifests/base/sa-rbac/cluster-role.yaml');
    const clusterResources = (clusterRole.rules || []).flatMap((rule) => rule.resources || []);

    expect(clusterResources).not.toEqual(
      expect.arrayContaining([
        'secrets',
        'persistentvolumeclaims',
        'roles',
        'rolebindings',
        'clusterrolebindings',
      ]),
    );

    const configMapRule = (clusterRole.rules || []).find((rule) =>
      rule.resources?.includes('configmaps'),
    );
    expect(configMapRule?.verbs).toEqual(['get', 'list']);
  });

  it('keeps required RBAC management scoped to the dashboard namespace', () => {
    const role = loadManifest('manifests/base/sa-rbac/role.yaml');
    const rbacRule = (role.rules || []).find(
      (rule) =>
        rule.apiGroups?.includes('rbac.authorization.k8s.io') &&
        rule.resources?.includes('roles') &&
        rule.resources?.includes('rolebindings'),
    );

    expect(rbacRule).toEqual(
      expect.objectContaining({
        verbs: expect.arrayContaining(['get', 'list', 'create', 'patch', 'delete']),
      }),
    );
  });
});
