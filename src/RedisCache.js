import Redis from 'ioredis';

const DELETE = Symbol('DELETE');
const CLEAR = Symbol('CLEAR');
const redisMap = {};
const localCache = {};
const localCacheTTL = {};
const processId = process.pid;
const getting = {};
const setting = {};
const getOrSetting = {};
let globalCache;

async function _withDefault(promise, defaultValue) {
	const value = await promise;
	if (value === undefined) return defaultValue;
	return value;
}

class RedisCache {
	static globalPrefix = 'a';
	static redisGetCount = 0;
	static useLocalCache = true;

	constructor(prefix, redisConf = {}) {
		this.prefix = prefix;

		if (redisConf instanceof Redis) {
			this.redis = redisConf;
			return;
		}

		const redis = {
			host: redisConf.host || '127.0.0.1',
			port: redisConf.port || 6379,
			password: redisConf.password || redisConf.auth || undefined,
		};

		this.redis = this.constructor.getRedis(redis);

		if ('useLocalCache' in redisConf) {
			this.useLocalCache = redisConf.useLocalCache;
		}
		else {
			this.useLocalCache = this.constructor.useLocalCache;
		}
	}

	static getRedis(redis) {
		const address = `${redis.host}:${redis.port}`;

		// cache redis connections in a map to prevent a new connection on each instance
		if (!redisMap[address]) {
			redisMap[address] = new Redis(redis);

			// we need a different connection for subscription, because once subscribed
			// no other commands can be issued
			this.subscribe(redis);
		}

		return redisMap[address];
	}

	static subscribe(redis) {
		const redisIns = new Redis(redis);
		const channelName = `RC:${this.globalPrefix}`;

		redisIns.subscribe(channelName, (err) => {
			if (err) {
				console.error(`[RedisCache] can't subscribe to channel ${channelName}`, err);
			}
		});

		redisIns.on('message', this.handleSubscribeMessage.bind(this));
	}

	static handleSubscribeMessage(channel, message) {
		// the channel is RC:${globalPrefix} => RC:a
		// the message is ${pid}\v${prefix}\v${command}\v${args.join('\v')}
		const [pid, prefix, command, key, ...args] = message.split('\v');

		// console.log(`[RedisCache] received subscribe command ${command} ${prefix}:${key}`);

		if (Number(pid) === processId) {
			// since the message came from the same process, it's already been handled
			// we don't need to do anything
			// console.log(`[RedisCache] ignored subscribe command ${command} from same process`);
			return;
		}

		if (command === 'delete' || command === 'setdel') {
			this._localCache(prefix, key, DELETE);
		}
		else if (command === 'clear') {
			this._localCache(prefix, '', CLEAR);
		}
		else if (command === 'set') {
			const ttl = Number(args[0]);
			const value = args[1];

			this._localCache(prefix, key, value, ttl);
		}
		else {
			console.error(`[RedisCache] unknown subscribe command ${command}`);
		}
	}

	// key for localCahce
	static _localKey(prefix, key) {
		return `${prefix}:${key}`;
	}

	// key for localCahce
	_localKey(key) {
		return `${this.prefix}:${key}`;
	}

	// get prefixed key for redis
	_key(key) {
		return `RC:${this.constructor.globalPrefix}:${this.prefix}:${key}`;
	}

	async _get(key) {
		this.constructor.redisGetCount++;
		const prefixedKey = this._key(key);
		const value = await this.redis.get(prefixedKey);
		if (value === null) return undefined;
		try {
			return JSON.parse(value);
		}
		catch (err) {
			return value;
		}
	}

	async _getWithTTL(key) {
		this.constructor.redisGetCount++;
		const prefixedKey = this._key(key);
		const results = await this.redis.pipeline([
			['get', prefixedKey],
			['pttl', prefixedKey],
		]).exec();

		const value = results[0][1];
		const ttl = results[1][1];

		if (value === null) return [undefined, ttl];
		try {
			return [JSON.parse(value), ttl];
		}
		catch (err) {
			return [value, ttl];
		}
	}

	async _has(key) {
		return this.redis.exists(this._key(key));
	}

	_set(key, value, ttl = 0) {
		if (value === undefined) return true;
		const prefixedKey = this._key(key);

		if (ttl <= 0) {
			return this.redis.set(prefixedKey, JSON.stringify(value));
		}

		return this.redis.set(prefixedKey, JSON.stringify(value), 'PX', ttl);
	}

	_del(key) {
		return this.redis.del(this._key(key));
	}

	_clear() {
		const keyGlob = this._key('*');
		return this.redis.eval(
			`for i, name in ipairs(redis.call('KEYS', '${keyGlob}')) do redis.call('DEL', name); end`,
			0,
		);
	}

	_size() {
		const keyGlob = this._key('*');
		return this.redis.eval(`return #redis.pcall('keys', '${keyGlob}')`, 0);
	}

	static _localCache(prefix, key, value, ttl = 0, redis = null) {
		// the channel is RC:${globalPrefix} => RC:a
		// the message is ${pid}\v${prefix}\v${command}\v${args.join('\v')}

		const prefixedKey = this._localKey(prefix, key);
		if (value === undefined) {
			const cached = localCache[prefixedKey];
			if (cached === undefined) return undefined;
			return cached;
		}

		if (value === CLEAR) {
			if (redis) {
				const channelName = `RC:${this.globalPrefix}`;
				const message = `${processId}\v${prefix}\vclear\vnull`;
				redis.publish(channelName, message);
			}

			Object.keys(localCache).forEach((_key) => {
				if (_key.startsWith(`${prefix}:`)) {
					// delete ttl
					if (_key in localCacheTTL) {
						clearTimeout(localCacheTTL[_key]);
						delete localCacheTTL[_key];
					}

					// delete data
					delete localCache[_key];
				}
			});

			return undefined;
		}

		if (value === DELETE) {
			if (redis) {
				const channelName = `RC:${this.globalPrefix}`;
				const message = `${processId}\v${prefix}\vdelete\v${key}`;
				redis.publish(channelName, message);
			}

			// delete ttl
			if (key in localCacheTTL) {
				clearTimeout(localCacheTTL[prefixedKey]);
				delete localCacheTTL[prefixedKey];
			}

			// delete data
			delete localCache[prefixedKey];
			return undefined;
		}

		// set value
		if (redis) {
			const channelName = `RC:${this.globalPrefix}`;
			const message = `${processId}\v${prefix}\vsetdel\v${key}`;
			redis.publish(channelName, message);
		}

		localCache[prefixedKey] = value;
		if (ttl > 0) {
			// set ttl
			clearTimeout(localCacheTTL[prefixedKey]);
			localCacheTTL[prefixedKey] = setTimeout(() => {
				delete localCache[prefixedKey];
			}, ttl);
		}

		return value;
	}

	_localCache(key, value, ttl = 0, publish = true) {
		return this.constructor._localCache(this.prefix, key, value, ttl, publish && this.redis);
	}

	_getting(key, value) {
		const prefixedKey = this._key(key);
		if (value === undefined) {
			return getting[prefixedKey];
		}
		if (value === DELETE) {
			delete getting[prefixedKey];
			return undefined;
		}

		getting[prefixedKey] = value;
		return value;
	}

	_setting(key, value) {
		const prefixedKey = this._key(key);
		if (value === undefined) {
			return setting[prefixedKey];
		}
		if (value === DELETE) {
			delete setting[prefixedKey];
			return undefined;
		}

		setting[prefixedKey] = value;
		return value;
	}

	_getOrSetting(key, value) {
		const prefixedKey = this._key(key);
		if (value === undefined) {
			return getOrSetting[prefixedKey] || setting[prefixedKey];
		}
		if (value === DELETE) {
			delete getOrSetting[prefixedKey];
			return undefined;
		}

		getOrSetting[prefixedKey] = value;
		return value;
	}

	/**
	 * gets a value from the cache immediately without waiting
	 * @param {string} key
	 * @param {any} defaultValue
	 * @param {object} options
	 * 	object of {
	 * 		parse => function to parse when value is fetched from redis
	 * 	}
	 */
	async getStale(key, defaultValue = undefined, options = {}) {
		if (this.useLocalCache) {
			const localValue = this._localCache(key);
			if (localValue !== undefined) {
				return localValue;
			}
		}

		const gettingPromise = this._getting(key);
		if (gettingPromise) {
			const [value] = await gettingPromise;
			if (value === undefined) return defaultValue;
			return value;
		}

		const promise = this._getWithTTL(key).then(async ([value, ttl]) => {
			if (value !== undefined && options.parse) {
				return [await options.parse(value), ttl];
			}
			return [value, ttl];
		});

		this._getting(key, promise);
		const [value, ttl] = await promise;
		if (this.useLocalCache) {
			this._localCache(key, value, ttl, false);
		}
		this._getting(key, DELETE);

		if (value === undefined) return defaultValue;
		return value;
	}

	/**
	 * gets a value from the cache
	 * @param {string} key
	 * @param {any} defaultValue
	 * @param {object} options
	 * 	object of {
	 * 		parse => function to parse when value is fetched from redis
	 * 	}
	 */
	async get(key, defaultValue = undefined, options = {}) {
		const settingPromise = this._setting(key);
		if (settingPromise) {
			return _withDefault(settingPromise, defaultValue);
		}

		return this.getStale(key, defaultValue, options);
	}

	/**
	 * checks if a key exists in the cache
	 * @param {string} key
	 */
	async has(key) {
		return this._has(key);
	}

	/**
	 * sets a value in the cache
	 * avoids dogpiling if the value is a promise or a function returning a promise
	 * @param {string} key
	 * @param {any} value
	 * @param {int|object} options either ttl in ms, or object of {ttl}
	 */
	async set(key, value, options = {}, ret = {}) {
		let ttl;
		if (typeof options === 'number') {
			ttl = options;
		}
		else {
			ttl = options.ttl || 0;
		}

		try {
			if (value && value.then) {
				// value is a Promise
				// resolve it and then cache it
				this._setting(key, value);
				const resolvedValue = await value;
				if (this.useLocalCache) {
					this._localCache(key, resolvedValue, ttl);
				}
				await this._set(key, resolvedValue, ttl);
				this._setting(key, DELETE);
				ret.__value = resolvedValue;
				return true;
			}
			else if (typeof value === 'function') {
				// value is a function
				// call it and set the result
				return this.set(key, value(key), ttl, ret);
			}

			// value is normal
			// just set it in the store
			this._setting(key, Promise.resolve(value));
			if (this.useLocalCache) {
				this._localCache(key, value, ttl);
			}
			await this._set(key, value, ttl);
			this._setting(key, DELETE);
			ret.__value = value;
			return true;
		}
		catch (error) {
			console.error(`[RedisCache] error while setting key ${key}`, error);
			await this._del(key);
			this._setting(key, DELETE);
			return false;
		}
	}

	async _getOrSet(key, value, options = {}) {
		// key already exists, return it
		const existingValue = await this.getStale(key, undefined, options);
		if (existingValue !== undefined) {
			return existingValue;
		}

		// no value given, return undefined
		if (value === undefined) {
			return undefined;
		}

		const ret = {};
		await this.set(key, value, options, ret);
		return ret.__value;
	}

	/**
	 * gets a value from the cache, or sets it if it doesn't exist
	 * this takes care of dogpiling (make sure value is a function to avoid dogpiling)
	 * @param {string} key key to get
	 * @param {any} value value to set if the key does not exist
	 * @param {int|object} options
	 * 	either ttl in ms,
	 * 	or object of {
	 * 		ttl => time to live in milliseconds,
	 * 		parse => function to parse when value is fetched from redis
	 * 	}
	 */
	async getOrSet(key, value, options = {}) {
		const settingPromise = this._getOrSetting(key);
		if (settingPromise) {
			// Some other process is still fetching the value
			// Don't dogpile shit, wait for the other process
			// to finish it
			return settingPromise;
		}

		const promise = this._getOrSet(key, value, options);
		this._getOrSetting(key, promise);
		const result = await promise;
		this._getOrSetting(key, DELETE);
		return result;
	}

	/**
	 * alias for getOrSet
	 */
	async $(key, value, options = {}) {
		return this.getOrSet(key, value, options);
	}

	/**
	 * deletes a value from the cache
	 * @param {string} key
	 */
	async del(key) {
		if (this.useLocalCache) {
			this._localCache(key, DELETE);
		}
		return this._del(key);
	}

	/**
	 * returns the size of the cache (no. of keys)
	 * NOTE: this method is expansive, so don't use it unless absolutely necessary
	 */
	async size() {
		return this._size();
	}

	/**
	 * clears the cache (deletes all keys)
	 * NOTE: this method is expansive, so don't use it unless absolutely necessary
	 */
	async clear() {
		if (this.useLocalCache) {
			this._localCache('', CLEAR);
		}
		return this._clear();
	}

	/**
	 * memoizes a function (caches the return value of the function)
	 * ```js
	 * const cachedFn = cache.memoize('expensiveFn', expensiveFn);
	 * const result = cachedFn('a', 'b');
	 * ```
	 * @param {string} key cache key with which to memoize the results
	 * @param {function} fn function to memoize
	 * @param {int|object} options either ttl in ms, or object of {ttl}
	 */
	memoize(key, fn, options = {}) {
		return async (...args) => {
			let cacheKey;
			if (options.keyFn) {
				cacheKey = key + ':' + options.keyFn(...args);
			}
			else {
				cacheKey = key + ':' + JSON.stringify(args);
			}

			return this.getOrSet(cacheKey, () => fn(...args), options);
		};
	}

	static globalCache(redis) {
		if (!globalCache) globalCache = new this('global', redis);
		return globalCache;
	}

	static getStale(key, defaultValue) {
		return this.globalCache().getStale(key, defaultValue);
	}

	static get(key, defaultValue) {
		return this.globalCache().get(key, defaultValue);
	}

	static has(key) {
		return this.globalCache().has(key);
	}

	static set(key, value, options = {}) {
		return this.globalCache().set(key, value, options);
	}

	static getOrSet(key, value, options = {}) {
		return this.globalCache().getOrSet(key, value, options);
	}

	static $(key, value, options = {}) {
		return this.globalCache().getOrSet(key, value, options);
	}

	static del(key) {
		return this.globalCache().del(key);
	}

	static size() {
		return this.globalCache().size();
	}

	static clear() {
		return this.globalCache().clear();
	}

	static memoize(key, fn, options = {}) {
		return this.globalCache().memoize(key, fn, options);
	}
}

export default RedisCache;
