import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveIdentityBadge } from '../src/lib/identity.ts'

test('resolveIdentityBadge maps the backend identity enum', () => {
  assert.deepEqual(resolveIdentityBadge('admin'), {
    role: 'admin',
    label: '房管',
    accent: '#7fd4ff',
  })
  assert.deepEqual(resolveIdentityBadge('guard'), {
    role: 'guard',
    label: '舰长',
    accent: '#ff8eb4',
  })
  assert.deepEqual(resolveIdentityBadge('member'), {
    role: 'member',
    label: '粉丝团',
    accent: '#9ddea0',
  })
})

test('resolveIdentityBadge draws nothing for normal, missing, or raw fields', () => {
  assert.equal(resolveIdentityBadge('normal'), null)
  assert.equal(resolveIdentityBadge(undefined), null)
  assert.equal(resolveIdentityBadge(null), null)
  assert.equal(resolveIdentityBadge(''), null)
  assert.equal(resolveIdentityBadge('vip'), null)
  assert.equal(resolveIdentityBadge('captain'), null)
  assert.equal(resolveIdentityBadge('总督'), null)
  assert.equal(resolveIdentityBadge(1), null)
  assert.equal(resolveIdentityBadge(3), null)
  assert.equal(resolveIdentityBadge({ guard_level: 1 }), null)
  assert.equal(resolveIdentityBadge({ guardLevel: 3 }), null)
  assert.equal(resolveIdentityBadge({ is_admin: 1 }), null)
  assert.equal(resolveIdentityBadge({ isAdmin: true, role: 'admin' }), null)
})
