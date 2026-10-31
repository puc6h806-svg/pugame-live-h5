import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignString, hmacSha256Hex, md5Hex, signRequest } from '../src/bili/sign';

/**
 * Official demo from auth docs:
 * secret = JzOzZfSHeYYnAMZ
 * expected Authorization =
 * a81c50234b6bbf15bc56e387ee4f19c6f871af2f70b837dc56db16517d4a341f
 */
describe('HMAC-SHA256 sign (official demo)', () => {
  it('matches official demo signature hex', () => {
    const demoSecret = 'JzOzZfSHeYYnAMZ';
    const demoHeaderStr = [
      'x-bili-accesskeyid:xxxx',
      'x-bili-content-md5:fa6837e35b2f591865b288dfd859ce9d',
      'x-bili-signature-method:HMAC-SHA256',
      'x-bili-signature-nonce:ad184c09-095f-91c3-0849-230dd3744045',
      'x-bili-signature-version:1.0',
      'x-bili-timestamp:1624594467',
    ].join('\n');

    const sig = hmacSha256Hex(demoSecret, demoHeaderStr);
    assert.equal(sig, 'a81c50234b6bbf15bc56e387ee4f19c6f871af2f70b837dc56db16517d4a341f');
  });

  it('buildSignString joins 6 x-bili lines in dict order without trailing newline', () => {
    const s = buildSignString({
      accessKeyId: 'xxxx',
      contentMd5: 'fa6837e35b2f591865b288dfd859ce9d',
      signatureNonce: 'ad184c09-095f-91c3-0849-230dd3744045',
      timestamp: '1624594467',
    });
    assert.ok(!s.endsWith('\n'));
    assert.equal(s.split('\n').length, 6);
  });

  it('signRequest produces lowercase Authorization and correct md5 header', () => {
    const body = '{"code":"demo","app_id":123}';
    const headers = signRequest(body, {
      accessKeyId: 'test-key',
      accessKeySecret: 'JzOzZfSHeYYnAMZ',
    }, {
      timestamp: '1624594467',
      nonce: 'ad184c09-095f-91c3-0849-230dd3744045',
    });
    assert.equal(headers['x-bili-content-md5'], md5Hex(body));
    assert.equal(headers['x-bili-signature-method'], 'HMAC-SHA256');
    assert.equal(headers['x-bili-signature-version'], '1.0');
    assert.match(headers.Authorization, /^[0-9a-f]{64}$/);
  });
});
