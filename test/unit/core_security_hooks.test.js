'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProtocolHub, Starlight, ERROR_CODES, digestToken } = require('../../src/core');
const { createTokenAuthenticator } = require('../../src/core/auth');

test('authentication hook exceptions never expose internal credentials to peers', async t => {
    const hub = new ProtocolHub({ port: 0, authenticate: async () => {
        throw new Error('synthetic-secret-from-identity-provider');
    } });
    const address = await hub.start();
    const client = new Starlight({ url: address.url });
    t.after(async () => { client.close(); await hub.close(); });
    await assert.rejects(() => client.connect(), error => {
        assert.equal(error.code, ERROR_CODES.UNAUTHORIZED);
        assert.equal(error.message, 'registration was rejected');
        assert.equal(error.details, undefined);
        return true;
    });
});

test('authorization rejects exceptions and truthy non-boolean decisions for both methods', async t => {
    for (const decision of ['throw', 'false', 1, { allowed: false }]) {
        for (const method of ['intent', 'cancel']) {
            await t.test(`${method}: ${JSON.stringify(decision)}`, async t => {
                const hub = new ProtocolHub({ port: 0, authenticate: () => true,
                    authorize: async () => {
                        if (decision === 'throw') throw new Error('synthetic-secret-policy-details');
                        return decision;
                    } });
                const address = await hub.start();
                const client = new Starlight({ url: address.url });
                t.after(async () => { client.close(); await hub.close(); });
                await client.connect();
                await assert.rejects(() => client[method]('example'), error => {
                    assert.equal(error.code, ERROR_CODES.UNAUTHORIZED);
                    assert.equal(error.message, method === 'intent'
                        ? 'intent was not authorized' : 'cancellation was not authorized');
                    assert.equal(error.details, undefined);
                    return true;
                });
            });
        }
    }
});

test('compiled token verifiers preserve uppercase digests and stable identity', () => {
    const token = 'synthetic-credential-00000000';
    const digest = digestToken(token);
    const authenticate = createTokenAuthenticator([digest.toUpperCase()]);
    assert.equal(authenticate({ token }), `token:${digest}`);
    assert.equal(authenticate({ token: 'synthetic-wrong-value-00000' }), false);
    assert.throws(() => createTokenAuthenticator(['malformed']), TypeError);
});
