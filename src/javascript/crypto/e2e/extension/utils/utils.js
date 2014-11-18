/**
 * @license
 * Copyright 2013 Google Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Provides common utility methods to the extension.
 */

goog.provide('e2e.ext.utils');
goog.provide('e2e.ext.utils.Error');

goog.require('e2e.ext.constants');
goog.require('e2e.ext.constants.ElementId');
goog.require('goog.crypt.base64');

goog.scope(function() {
var constants = e2e.ext.constants;
var utils = e2e.ext.utils;


/**
 * Creates a blob URL to download a file. Default content type is
 * application/pgp-keys.
 * @param {string} content The content to write to the new file.
 * @param {!function(string)} callback The callback to invoke with the URL of
 *     the created file.
 * @param {string=} opt_type The MIME content type of the file
 */
utils.writeToFile = function(content, callback, opt_type) {
  var type = opt_type || constants.Mime.KEYS;
  var blob = new Blob([content], {type: type});
  var url = URL.createObjectURL(blob);
  callback(url);
};


/**
 * Reads the contents of the provided file returns it via the provided callback.
 * Automatically handles both binary OpenPGP packets and text files. Specify
 * the opt_binary flag to read a file as binary even if it is not an OpenPGP
 * packet.
 * @param {!File} file The file to read.
 * @param {!function(string)} callback The callback to invoke with the file's
 *     contents.
 */
utils.readFile = function(file, callback) {
  utils.readFile_(false, file, function(contents) {
    // The 0x80 bit is always set for the Packet Tag for OpenPGP packets.
    if (contents.charCodeAt(0) >= 0x80) {
      callback(contents);
    } else {
      utils.readFile_(true, file, callback);
    }
  });
};


/**
 * Reads each file in a filelist as an Attachment object and executes the
 * provided callback when all reads have finished.
 * @param {!FileList} filelist the filelist to read
 * @param {!function(Array.<e2e.ext.mime.types.Attachment>)}
 */
utils.readFilelist = function(filelist, callback) {
  var attachments = [];
  var file;
  if (!filelist.length) {
    callback(attachments);
  } else {
    var fileCallback = function(filename, fileContent) {
      attachments.push({filename: filename,
          content: goog.crypt.base64.decodeStringToByteArray(fileContent)});
      if (attachments.length === filelist.length) {
        callback(attachments);
      }
    };
    for (var i = 0; i < filelist.length; i++) {
      file = filelist.item(i);
      utils.readFile_(false, file, goog.bind(fileCallback, this, file.name));
    }
  }
};


/**
 * Reads the contents of the provided file as text and returns them via the
 * provided callback.
 * @param {boolean} asText If true, then read as text.
 * @param {!File} file The file to read.
 * @param {!function(string)} callback The callback to invoke with the file's
 *     contents.
 * @private
 */
utils.readFile_ = function(asText, file, callback) {
  var reader = new FileReader();
  reader.onload = function() {
    if (reader.readyState != reader.LOADING) {
      reader.onload = null;
      callback(/** @type {string} */ (reader.result));
    }
  };
  if (asText) {
    reader.readAsText(file);
  } else {
    reader.readAsBinaryString(file);
  }
};


/**
 * Logs errors to console.
 * @param {*} error The error to log.
 */
utils.errorHandler = function(error) {
  window.console.error(error);
};



/**
 * Constructor for a i18n friendly error.
 * @param {string} defaultMsg The default error message.
 * @param {string} msgId The i18n message id.
 * @constructor
 * @extends {Error}
 */
utils.Error = function(defaultMsg, msgId) {
  goog.base(this, defaultMsg);
  this.messageId = msgId;
};
goog.inherits(utils.Error, Error);


/**
 * Displays Chrome notifications to the user.
 * @param {string} msg The message to display to the user.
 * @param {!function()} callback A callback to invoke when the notification
 *     has been displayed.
 */
utils.showNotification = function(msg, callback) {
  chrome.notifications.create(constants.ElementId.NOTIFICATION_SUCCESS, {
    type: 'basic',
    iconUrl: '/images/icon-48.png',
    title: chrome.i18n.getMessage('extName'),
    message: msg
  }, function() {
    window.setTimeout(function() {
      chrome.notifications.clear(
          constants.ElementId.NOTIFICATION_SUCCESS,
          goog.nullFunction); // Dummy callback to keep Chrome happy.
    }, constants.NOTIFICATIONS_DELAY);
    callback();
  });
};


});  // goog.scope

