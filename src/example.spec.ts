import axios, { AxiosInstance } from 'axios';
import nock from 'nock';

import { connectAxiosAuthRefreshInterceptor } from './index';

const refreshToken = async () => {
    const { data } = await axios.post('/refresh', { refresh_token: 'refresh_token1' });

    return data;
};

describe('Concurrent requests auth refresh', () => {
    let instance: AxiosInstance;

    beforeEach(() => {
        instance = axios.create();
        connectAxiosAuthRefreshInterceptor(instance, refreshToken, {
            updateAuthHeaders: (request, tokenData) => {
                request.headers.authorization = `Bearer ${tokenData.access_token}`;
            },
        });
    });

    test('should refresh token once, all requests should return with status 200', async () => {
        const scope = nock('http://localhost')
            .get('/test')
            .matchHeader('authorization', 'Bearer abc1')
            .reply(401)
            .get('/test')
            .matchHeader('authorization', 'Bearer abc1')
            .reply(401)
            .post('/refresh', { refresh_token: 'refresh_token1' })
            .reply(200, {
                access_token: 'abc2',
                refresh_token: 'refresh_token',
            })
            .get('/test')
            .matchHeader('authorization', 'Bearer abc2')
            .reply(200, 'Ok')
            .get('/test')
            .matchHeader('authorization', 'Bearer abc2')
            .reply(200, 'Ok');

        const request1 = instance.get('/test', {
            headers: {
                authorization: 'Bearer abc1',
            },
        });
        const request2 = instance.get('/test', {
            headers: {
                authorization: 'Bearer abc1',
            },
        });

        await Promise.all([request1, request2]);

        expect(scope.isDone()).toBe(true);
    });

    test.only('refresh should be called only once', async () => {
        const scope = nock('http://localhost')
            .get('/test')
            .matchHeader('authorization', 'Bearer abc1')
            .delay(500)
            .reply(401)
            .get('/test')
            .delay(1000)
            .matchHeader('authorization', 'Bearer abc1')
            .reply(401)
            .post('/refresh', { refresh_token: 'refresh_token1' })
            .reply(200, {
                access_token: 'abc2',
                refresh_token: 'refresh_token',
            })
            .get('/test')
            .matchHeader('authorization', 'Bearer abc2')
            .reply(200, 'Ok')
            .get('/test')
            .matchHeader('authorization', 'Bearer abc2')
            .reply(200, 'Ok');

        const request1 = instance.get('/test', {
            headers: {
                authorization: 'Bearer abc1',
            },
        });
        const request2 = instance.get('/test', {
            headers: {
                authorization: 'Bearer abc1',
            },
        });

        await Promise.all([request1, request2]);
    });
});
