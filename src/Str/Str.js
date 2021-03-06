import _ from 'lodash';
import numberToWords from './numberToWords';

function invertCase(str) {
	let output = '';
	let code = '';

	for (let i = 0, len = str.length - 1; i <= len; i++) {
		code = str.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			output += str.charAt(i).toLowerCase();
		}
		else if (code >= 97 && code <= 122) {
			output += str.charAt(i).toUpperCase();
		}
		else {
			output += str.charAt(i);
		}
	}

	return output;
}

function isVowel(char) {
	return (/^[aeiou]$/i).test(char);
}

function isConsonant(char) {
	return !isVowel(char);
}

// Get the plural of a string
function plural(str) {
	if (!str || str.length <= 2) return str;

	if (str.charAt(str.length - 1) === 'y') {
		if (isVowel(str.charAt(str.length - 2))) {
			// If the y has a vowel before it (i.e. toys), then you just add the s.
			return str + 's';
		}

		// If a this ends in y with a consonant before it (fly)
		// you drop the y and add -ies to make it plural.
		return str.slice(0, -1) + 'ies';
	}
	else if (str.substring(str.length - 2) === 'us') {
		// ends in us -> i, needs to preceed the generic 's' rule
		return str.slice(0, -2) + 'i';
	}
	else if (
		['ch', 'sh'].indexOf(str.substring(str.length - 2)) !== -1 ||
		['x', 's'].indexOf(str.charAt(str.length - 1)) !== -1
	) {
		// If a this ends in ch, sh, x, s, you add -es to make it plural.
		return str + 'es';
	}

	// anything else, just add s
	return str + 's';
}

// Pluralize a character if the count is greater than 1
function pluralize(str, count = 2) {
	if (count <= 1) return str;
	return plural(str);
}

/**
 * transform a string by replacing characters from from string to to string
 * eg. `Str.transform('abc', 'bc', 'de') // returns ade`
 * @param {string} str string to transform
 * @param {string} from characters to replace in the string
 * @param {string} to characters to replace with in the string
 * @returns {string} transformed string
 */
function transform(str, from, to) {
	const len = str.length;
	let out = '';
	let pos;

	for (let i = 0; i < len; i++) {
		pos = from.indexOf(str.charAt(i));
		if (pos >= 0) {
			out += to.charAt(pos);
		}
		else {
			out += str.charAt(i);
		}
	}

	return out;
}

// Break String From Next Given Character After A Given Position
function trimToNext(str, pos, char = ' ') {
	const trimPos = str.indexOf(char, pos);
	if (trimPos !== -1) {
		return _.trimEnd(str.substring(0, trimPos), char);
	}

	return _.trimEnd(str, char);
}

const numberLocaleCache = {};
function _getNumberLocale(options) {
	const {locale = 'en', currency = undefined, decimals = 0} = options;
	const localeKey = `${locale}${currency}${decimals}`;
	if (!(localeKey in numberLocaleCache)) {
		numberLocaleCache[localeKey] = new Intl.NumberFormat(locale, {
			style: currency ? 'currency' : 'decimal',
			currency,
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
	}

	return numberLocaleCache[localeKey];
}

/**
 * Format a number according to a particular locale
 * Similar to Number.toLocaleFormat, except being significantly faster
 *
 * @param {number} number the number to format
 * @param {object|string} options string of locale
 * 	or object of {locale: 'en-IN', currency: 'INR', decimals: 0}
 * @returns {string} formatted number
 */
function numberFormat(number, options = {}) {
	if (typeof options === 'string') {
		options = {locale: options};
	}

	return _getNumberLocale(options).format(number);
}

/**
 * Space clean a string
 * Converts consecutive multiple spaces / tabs / newlines in the string into a single space
 * @param {string} str
 */
function spaceClean(str) {
	if (!str) return '';
	return str.replace(/(?:\s|&nbsp;|&#32;)+/ig, ' ').trim();
}

/**
 * Rotate a string by 13 characters
 *
 * @param {String} str the string to be rotated
 * @returns {String} rotated string
 */
function rot13(str) {
	const s = [];
	for (let i = 0; i < str.length; i++) {
		const j = str.charCodeAt(i);
		if (((j >= 65) && (j <= 77)) || ((j >= 97) && (j <= 109))) {
			s[i] = String.fromCharCode(j + 13);
		}
		else if (((j >= 78) && (j <= 90)) || ((j >= 110) && (j <= 122))) {
			s[i] = String.fromCharCode(j - 13);
		}
		else {
			s[i] = String.fromCharCode(j);
		}
	}

	return s.join('');
}

/**
 * Rotate a string by 47 characters
 *
 * @param {String} str the string to be rotated
 * @returns {String} rotated string
 */
function rot47(str) {
	const s = [];
	for (let i = 0; i < str.length; i++) {
		const j = str.charCodeAt(i);
		if ((j >= 33) && (j <= 126)) {
			s[i] = String.fromCharCode(33 + ((j + 14) % 94));
		}
		else {
			s[i] = String.fromCharCode(j);
		}
	}

	return s.join('');
}

function tryParseJson(str) {
	try {
		return JSON.parse(str);
	}
	catch (e) {
		return null;
	}
}

/**
 *
 * @param {string} str the string to remove tags from
 * @param {object} options object containing:
 * 	allowed: array of allowed tags eg. ['p', 'b', 'span'], default: []
 * 	blocked: array of blocked tags eg. ['p'], default: []
 * 	replaceWith: replace the removed tags with this string, default: ''
 *
 * if allowed is not given and blocked is given
 * then by default all tags not mentioned in blocked are allowed
 *
 * @returns {string} resulting string by removing all tags mentioned
 */
function stripTags(str, options = {}) {
	if (!str) return '';

	const tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
	const commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;

	const replaceWith = options.replaceWith || '';
	const allowed = options.allowed;
	const blocked = options.blocked;

	const replaceTags = function ($0, $1) {
		if (blocked) {
			// tag is blocked
			if (blocked.includes($1.toLowerCase())) return replaceWith;
			// allowed is not given and blocked is, that means all tags are allowed
			if (!allowed) return $0;
		}
		// tag is allowed
		if (allowed && allowed.includes($1.toLowerCase())) return $0;
		// by default all tags are blocked
		return replaceWith;
	};

	let after = String(str);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const before = after;
		after = before
			.replace(commentsAndPhpTags, replaceWith)
			.replace(tags, replaceTags);

		// return once no more tags are removed
		if (before === after) {
			return after;
		}
	}
}

/**
 * Escape a string for including in regular expressions
 * @param {string} str string to escape
 * @returns {string} escaped string
 */
function escapeRegex(str) {
	if (!str) return '';
	return String(str).replace(/[-[\]{}()*+!<=:?./\\^$|#,]/g, '\\$&');
}

export default {
	invertCase,
	isVowel,
	isConsonant,
	plural,
	pluralize,
	transform,
	trimToNext,
	numberFormat,
	numberToWords,
	spaceClean,
	rot13,
	rot47,
	tryParseJson,
	stripTags,
	escapeRegex,
};
