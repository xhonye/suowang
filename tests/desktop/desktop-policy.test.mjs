import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentTypeForAvatar,
  isAllowedLocalNavigation,
  resolveExportKind,
  resolveGitHubTarget,
} from '../../desktop/desktop-policy.mjs';

test('desktop GitHub and export capabilities accept only fixed enums', () => {
  assert.equal(resolveGitHubTarget('repo'), 'https://github.com/xhonye/suowang');
  assert.equal(resolveGitHubTarget('issues'), 'https://github.com/xhonye/suowang/issues');
  assert.equal(resolveExportKind('json').fileName, 'suowang-export.json');
  assert.throws(() => resolveGitHubTarget('https://example.com'), /Unknown GitHub target/);
  assert.throws(() => resolveExportKind('../database'), /Unknown export kind/);
});

test('renderer navigation stays on the exact dynamic loopback origin', () => {
  const origin = 'http://127.0.0.1:43127';
  assert.equal(isAllowedLocalNavigation(`${origin}/#settings`, origin), true);
  assert.equal(isAllowedLocalNavigation('http://127.0.0.1:2037/', origin), false);
  assert.equal(isAllowedLocalNavigation('https://github.com/xhonye/suowang', origin), false);
  assert.equal(isAllowedLocalNavigation('javascript:alert(1)', origin), false);
  assert.equal(isAllowedLocalNavigation('not a url', origin), false);
});

test('avatar MIME mapping rejects non-image extensions', () => {
  assert.equal(contentTypeForAvatar('portrait.JPEG'), 'image/jpeg');
  assert.equal(contentTypeForAvatar('portrait.webp'), 'image/webp');
  assert.throws(() => contentTypeForAvatar('portrait.svg'), /Unsupported avatar type/);
});
