const _ = require('lodash');
const promisify = require('thenify-all');
const _path = require('path');
const _rimraf = promisify(require('rimraf'));
const _mkdirp = promisify(require('mkdirp'));
const _glob = promisify(require('glob'));
const _chmodr = promisify(require('chmodr'));
const _chownr = promisify(require('chownr'));
const System = require('./System');
const _fs = require('fs');

const fs = promisify(_fs);

/**
 * Class representing a File
 */
class File {
	/**
	 * Creates a new File object.
	 *
	 * @param  {String} path path to the file
	 */
	constructor(path) {
		this.path = path;
	}

	/**
	 * Checks whether a file exists already.
	 *
	 * @return {Boolean} true, if the file exists; false, otherwise
	 */
	async exists() {
		try {
			await fs.lstat(this.path);
			return true;
		}
		catch (e) {
			return false;
		}
	}

	/**
	* Checks whether a file exists already.
	*
	* @return {Boolean} true, if the file exists; false, otherwise
	 */
	existsSync() {
		try {
			_fs.lstatSync(this.path);
			return true;
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * Returns whether this File object represents a file.
	 *
	 * @return {Boolean} true, if this object represents a file; false, otherwise
	 */
	async isFile() {
		try {
			return (await fs.lstat(this.path)).isFile();
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * Returns whether this File object represents a directory.
	 *
	 * @return {Boolean} true, if this object represents a directory; false, otherwise
	 */
	async isDir() {
		try {
			return (await fs.lstat(this.path)).isDirectory();
		}
		catch (e) {
			return false;
		}
	}

	/**
	 * Returns a Date object representing the time when file was last modified.
	 *
	 * @return {Date} Date object, if file exists and its stats are read successfully; 0, otherwise
	 */
	async mtime() {
		try {
			return (await fs.lstat(this.path)).mtime;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Returns a Date object representing the time when file was last changed.
	 *
	 * @return {Date} Date object, if file exists and its stats are read successfully; 0, otherwise
	 */
	async ctime() {
		try {
			return (await fs.lstat(this.path)).ctime;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Returns a Date object representing the time when file was last accessed.
	 *
	 * @return {Date} Date object, if file exists and its stats are read successfully; 0, otherwise
	 */
	async atime() {
		try {
			return (await fs.lstat(this.path)).atime;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Returns a Date object representing the time when file was created.
	 *
	 * @return {Date} Date object, if file exists and its stats are read successfully; 0, otherwise
	 */
	async crtime() {
		try {
			return (await fs.lstat(this.path)).birthtime;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Returns an object with the stats of the file. If the path for the file
	 * is a symlink, then stats of the symlink are returned.
	 *
	 * @return {Object} Stats object
	 */
	async lstat() {
		return fs.lstat(this.path);
	}

	/**
	 * Returns an object with the stats of the file. If the path for the file
	 * is a symlink, then stats of the target of the symlink are returned.
	 *
	 * @return {Object} Stats object
	 */
	async stat() {
		return fs.stat(this.path);
	}


	/**
	 * Returns the size of the file in bytes. If the file is not found
	 * or can't be read successfully, 0 is returned.
	 *
	 * @return {Number} Size of file (in bytes)
	 */
	async size() {
		try {
			return (await fs.lstat(this.path)).size;
		}
		catch (e) {
			return 0;
		}
	}

	/**
	 * Change the mode of the file.
	 *
	 * @param  {Number|String}  mode An octal number or a string representing the file mode
	 * @return {Number}              0, on success; -1, if some error occurred
	 */
	async chmod(mode) {
		return fs.chmod(this.path, mode);
	}

	/**
	 * Change the mode of the file or directory recursively.
	 *
	 * @param  {Number|String}  mode An octal number or a string representing the file mode
	 * @return {Number}              0, on success; -1, if some error occurred
	 */
	async chmodr(mode) {
		return _chmodr(this.path, mode);
	}

	/**
	 * Change the owner and group of the file.
	 *
	 * @param  {Number|String} user  user id, or user name
	 * @param  {Number|String} group group id, or group name
	 * @return {Number}              0, on success; any other number, if some error occurred
	 *
	 * NOTE: If the owner or group is specified as -1, then that ID is not changed
	 */
	async chown(user, group) {
		if (Number.isInteger(user) && Number.isInteger(group)) {
			return fs.chown(this.path, user, group);
		}

		return System.execOut(`chown ${user}:${group} ${this.path}`);
	}

	/**
	 * Change the owner and group of the file recursively.
	 *
	 * @param  {Number|String} user  user id, or user name
	 * @param  {Number|String} group group id, or group name
	 * @return {Number}              0, on success; any other number, if some error occurred
	 *
	 * NOTE: If the owner or group is specified as -1, then that ID is not changed
	 */
	async chownr(user, group) {
		if (Number.isInteger(user) && Number.isInteger(group)) {
			return _chownr(this.path, user, group);
		}

		return System.execOut(`chown -R ${user}:${group} ${this.path}`);
	}

	/**
	 * Change the name or location of the file.
	 *
	 * @param  {String} newName new path/location (not just name) for the file
	 * @return {Number}         0, on success; -1, if some error occurred
	 */
	async rename(newName) {
		try {
			await fs.rename(this.path, newName);
			this.path = newName;
		}
		catch (err) {
			return -1;
		}

		return 0;
	}

	/**
	 * Move file to a new location
	 *
	 * @param  {String} newName new location (or path) for the file
	 * @return {Number}         0, on success; -1, if some error occurred
	 */
	async mv(newName) {
		return this.rename(newName);
	}

	/**
	 * Unlink the path from the file.
	 *
	 * NOTE: If the path referred to a
	 * symbolic link, the link is removed. If the path is the only link
	 * to the file then the file will be deleted.
	 */
	async unlink() {
		return fs.unlink(this.path);
	}

	/**
	 * Remove the file.
	 *
	 * NOTE: The path is unlinked from the file, but the file
	 * is deleted only if the path was the only link to the file and
	 * the file was not opened in any other process.
	 */
	async rm() {
		return this.unlink();
	}

	/**
	 * Remove the directory.
	 *
	 * NOTE: The directory will be deleted only if it is empty.
	 */
	async rmdir() {
		return fs.rmdir(this.path);
	}

	/**
	 * Recursively delete the directory and all its contents.
	 */
	async rmrf() {
		return _rimraf(this.path);
	}

	/**
	 * Create a directory.
	 *
	 * @param  {Number} [mode = 0o755] file mode for the directory
	 */
	async mkdir(mode = 0o755) {
		return fs.mkdir(this.path, mode);
	}

	/**
	 * Create a new directory and any necessary subdirectories.
	 *
	 * @param  {Number} [mode = 0o755] file mode for the directory
	 */
	async mkdirp(mode = 0o755) {
		return _mkdirp(this.path, mode);
	}

	/**
	 * Perform a glob search with the path of the file as the pattern.
	 *
	 * @return {Array} Array containing the matches
	 */
	async glob() {
		return _glob(this.path);
	}

	/**
	 * Read contents of the file.
	 *
	 * @return {String|Buffer} contents of the file
	 */
	async read() {
		return fs.readFile(this.path, 'utf8');
	}

	/**
	 * Create (all necessary directories for) the path of the file/directory.
	 *
	 * @param  {Number} [mode = 0o755] file mode for the directory
	 */
	async mkdirpPath(mode = 0o755) {
		return _mkdirp(_path.dirname(this.path), mode);
	}

	/**
	 * Write contents to the file.
	 *
	 * @param  {String|Buffer} contents contents to be written to the file
	 * @param  {Object} [options = {}]  contains options for writing to the file
	 *
	 * The options can include parameters such as fileMode, dirMode, retries and encoding.
	 */
	async write(contents, options = {}) {
		const opts = _.assign({
			fileMode: 0o644,
			dirMode: 0o755,
			retries: 0,
		}, options);

		if (!opts.retries) {
			await this.mkdirpPath(opts.dirMode);
			return fs.writeFile(this.path, contents, {encoding: 'utf8', mode: opts.fileMode});
		}

		try {
			return this.write(contents, _.assign(opts, {retries: 0}));
		}
		catch (e) {
			opts.retries--;
			return this.write(contents, opts);
		}
	}

	/**
	 * Append contents to the file.
	 *
	 * @param  {String|Buffer} contents contents to be written to the file
	 * @param  {Object} [options = {}]  contains options for appending to the file
	 *
	 * The options can include parameters such as fileMode, dirMode, retries and encoding.
	 */
	async append(contents, options = {}) {
		const opts = _.assign({
			fileMode: 0o644,
			dirMode: 0o755,
			retries: 0,
		}, options);

		if (!opts.retries) {
			await this.mkdirpPath(opts.dirMode);
			return fs.appendFile(this.path, contents, {encoding: 'utf8', mode: opts.fileMode});
		}

		try {
			return this.append(contents, _.assign(opts, {retries: 0}));
		}
		catch (e) {
			opts.retries--;
			return this.append(contents, opts);
		}
	}

	/**
	 * Copy the file to some destination.
	 *
	 * @param  {String} destination    path of the destination
	 * @param  {Object} [options = {}] options for copying the file
	 *
	 * If the overwrite option is explicitly set to false, only then
	 * will the function not attempt to overwrite the file if it (already)
	 * exists at the destination.
	 */
	async copy(destination, options = {}) {
		const opts = _.assign({
			overwrite: true,
		}, options);

		if (opts.overwrite) {
			return fs.copyFile(this.path, destination);
		}

		return fs.copyFile(this.path, destination, fs.constants.COPYFILE_EXCL);
	}

	/**
	 * Return the canonicalized absolute pathname
	 *
	 * @return {String} the resolved path
	 */
	async realpath() {
		return fs.realpath(this.path);
	}

	/**
	 * Return the canonicalized absolute pathname
	 *
	 * @return {String} the resolved path
	 */
	realpathSync() {
		return _fs.realpathSync(this.path);
	}
}

/**
 * Returns a new File object representing the file located at 'path'.
 *
 * @param  {String} path path of the file
 * @return {File}        File object representing the file located at the path
 */
function file(path) {
	return new File(path);
}

module.exports = file;
