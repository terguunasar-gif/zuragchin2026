import assert from 'node:assert/strict';
import { chromeIntentUrl, shouldAutoOpenChrome, socialInAppName } from '../src/lib/browserEnv.ts';

const android = 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
const messenger = `${android} [FB_IAB/FB4A;FBAV/1;Messenger]`;
const facebook = `${android} [FBAN/FB4A;FBAV/1]`;
const instagram = `${android} Instagram 300.0.0`;
const line = `${android} Line/14.0`;
const kakao = `${android} KAKAOTALK 10.0`;
const iosMessenger = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/1;Messenger]';
const chrome = `${android} Chrome/120.0.0.0`;
const bankWv = `${android}; wv) Version/4.0`;

assert.equal(socialInAppName(messenger), 'Messenger');
assert.equal(socialInAppName(facebook), 'Facebook');
assert.equal(socialInAppName(instagram), 'Instagram');
assert.equal(socialInAppName(line), 'Line');
assert.equal(socialInAppName(kakao), 'KakaoTalk');
assert.equal(socialInAppName(iosMessenger), 'Messenger');
assert.equal(socialInAppName(chrome), null);
assert.equal(socialInAppName(bankWv), null);

const href = 'https://www.zuragchin.mn/album/abc?add=1#photo';
const intent = chromeIntentUrl(href);
assert.equal(intent, 'intent://www.zuragchin.mn/album/abc?add=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.zuragchin.mn%2Falbum%2Fabc%3Fadd%3D1%23photo;end');

const base = { ua: messenger, pathname: '/album/abc', search: '', alreadyTried: false };
assert.equal(shouldAutoOpenChrome(base), true);
assert.equal(shouldAutoOpenChrome({ ...base, alreadyTried: true }), false);
assert.equal(shouldAutoOpenChrome({ ...base, search: '?stay=1' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, ua: iosMessenger }), false);
assert.equal(shouldAutoOpenChrome({ ...base, ua: bankWv }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/receipt/inv-1' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/my-purchases' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/offer/tok' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/booth/abc' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/album/abc/kiosk' }), false);
assert.equal(shouldAutoOpenChrome({ ...base, pathname: '/album/abc/screen' }), false);

console.log('in-app browser ok');
