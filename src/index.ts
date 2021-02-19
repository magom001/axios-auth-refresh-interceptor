import { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

type TokenData = any;
type Resolve = (tokenData: TokenData) => void;
type Reject = (reason?: unknown) => void;
type PromiseCallback = { resolve: Resolve; reject: Reject };

interface Options {
    updateAuthHeaders?: (request: AxiosRequestConfig, tokenData: TokenData) => void;
    shouldIntercept?: (error: AxiosError) => boolean;
}

enum StatusCode {
    Forbidden = 401,
}

const shouldInterceptDefault = (error: AxiosError) => {
    try {
        return error?.response?.status === StatusCode.Forbidden;
    } catch (e) {
        return false;
    }
};

export const connectAxiosAuthRefreshInterceptor = (
    axiosClient: AxiosInstance,
    refreshToken: () => Promise<TokenData>,
    options: Options,
) => {
    let isRefreshing = false;
    let failedQueue: PromiseCallback[] = [];
    const shouldIntercept = options.shouldIntercept || shouldInterceptDefault;

    const processQueue = (error: unknown, tokenData?: TokenData) => {
        failedQueue.forEach((promise: PromiseCallback) => {
            if (error) {
                promise.reject(error);
            } else {
                promise.resolve(tokenData);
            }
        });

        failedQueue = [];
    };

    const interceptor = (error: AxiosError & { config: { _retry?: boolean; _queued?: boolean } }) => {
        if (!shouldIntercept(error)) {
            return Promise.reject(error);
        }

        if (error.config._retry || error.config._queued) {
            return Promise.reject(error);
        }

        const originalRequest = error.config;

        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            })
                .then((tokenData) => {
                    originalRequest._queued = true;

                    if (options?.updateAuthHeaders) {
                        options.updateAuthHeaders(originalRequest, tokenData);
                    }

                    return axiosClient.request(originalRequest);
                })
                .catch(() => {
                    return Promise.reject(error);
                });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
            refreshToken()
                .then((tokenData) => {
                    processQueue(null, tokenData);
                    if (options?.updateAuthHeaders) {
                        options.updateAuthHeaders(originalRequest, tokenData);
                    }
                    resolve(axiosClient.request(originalRequest));
                })
                .catch((error: AxiosError) => {
                    processQueue(error);
                    reject(error);
                })
                .finally(() => {
                    isRefreshing = false;
                });
        });
    };

    axiosClient.interceptors.response.use(undefined, interceptor);
};
