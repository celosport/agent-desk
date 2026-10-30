// node --test scripts/iniciar-com-api.spec.mjs  (npm run test:scripts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararVersoes, escolherNode, nodeCompativel } from './iniciar-com-api.mjs';

test('aceita só as versões do Node exigidas pelo Angular 22', () => {
  for (const v of ['v22.22.3', 'v22.23.0', 'v24.15.0', 'v24.20.1', 'v26.0.0']) assert.equal(nodeCompativel(v), true, v);
  for (const v of ['v18.20.4', 'v20.19.0', 'v22.22.2', 'v24.14.9', 'v23.5.0']) assert.equal(nodeCompativel(v), false, v);
});

test('ordena da versão mais nova para a mais antiga', () => {
  assert.deepEqual(['v22.22.3', 'v24.15.0', 'v22.23.1'].sort(compararVersoes), ['v24.15.0', 'v22.23.1', 'v22.22.3']);
});

test('escolhe o Node compatível mais novo, ou null se nenhum serve', () => {
  const achados = [
    { caminho: 'vs/node', versao: 'v18.20.4' },
    { caminho: 'nvm/22', versao: 'v22.22.3' },
    { caminho: 'nvm/24', versao: 'v24.15.0' },
  ];
  assert.equal(escolherNode(achados)?.caminho, 'nvm/24');
  assert.equal(escolherNode([{ caminho: 'vs/node', versao: 'v18.20.4' }]), null);
});
