/**
 * @license
 * Copyright 2014 Google Inc. All rights reserved.
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
 * @fileoverview Helper utils for building/parsing PGP/MIME emails.
 * @author yzhu@yahoo-inc.com (Yan Zhu)
 */

goog.provide('e2e.ext.mime.utils');

goog.require('e2e.error.UnsupportedError');
goog.require('e2e.ext.mime.MimeNode');
goog.require('e2e.ext.constants.Mime');
goog.require('goog.array');
goog.require('goog.crypt.base64');
goog.require('goog.object');
goog.require('goog.string');

goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;
var utils = e2e.ext.mime.utils;


/**
 * Extracts the encrypted MIME tree out of PGP/MIME email text.
 * @param {string} text The text to parse.
 * @return {(string|undefined)}
 */
ext.mime.utils.getEncryptedMimeTree = function(text) {
  var boundary;
  var endLocation;
  var lines = text.split(constants.Mime.CRLF);

  var line = lines.shift();

  // Parse the Content-Type header. Ignore other headers for now.
  var contentTypeLine = utils.parseHeaderLine(line);
  if (!utils.validateContentTypeHeader_(contentTypeLine) ||
      contentTypeLine.value !== constants.Mime.MULTIPART_ENCRYPTED ||
      contentTypeLine.params.protocol !== constants.Mime.ENCRYPTED) {
    // This does not appear to be a valid PGP encrypted MIME message.
    utils.fail_();
  } else {
    boundary = '--' + outerContentType.params.boundary;
    // Ignore all lines after the end boundary
    endLocation = goog.array.indexOf(lines, boundary + '--');
    if (endLocation === -1) {
      utils.fail_();
      return;
    }
    lines = goog.array.slice(lines, 0, endLocation);
    // Ignore the rest of the headers
    do {
      line = lines.shift();
    } while (line !== boundary);
    // Next node is the required 'application/pgp-encrypted' version node.
    contentTypeLine = utils.parseHeaderLine(lines.shift());
    if (!utils.validateContentTypeHeader_(contentTypeLine) ||
        contentTypeLine.value !== constants.Mime.ENCRYPTED) {
      utils.fail_();
    } else {
      // Ignore the rest of the node
      do {
        line = lines.shift();
      } while (line !== boundary);
      // Next node is the actual encrypted content.
      contentTypeLine = utils.parseHeaderLine(lines.shift());
      if (!utils.validateContentTypeHeader_(contentTypeLine) ||
          contentTypeLine.value !== constants.Mime.OCTET_STREAM) {
        utils.fail_();
      } else {
        // Ignore the rest of the headers
        do {
          line = lines.shift();
        } while (line !== '');
        return (lines.join(constants.Mime.CRLF));
      }
    }
  }
};
});  // goog.scope


/**
 * Validates a parsed Content-Type header.
 * @param {Object} header The header to validate
 * @return {boolean}
 * @private
 */
ext.mime.utils.validateContentTypeHeader_ = function(header) {
  return (header && header.params && header.params.boundary &&
          header.name === constants.Mime.CONTENT_TYPE);
};


/**
 * Extracts mail content out of a plaintext MIME tree.
 * @param {string} text The text to parse
 * @return {Array.<!e2e.ext.mime.types.MailContent>}
 */
ext.mime.utils.getMailContent = function(text) {
  var content = [];
  var lines = text.split(constants.Mime.CRLF);

  // Case 1: Single plaintext node.

  // Case 2: Plaintext node with attachment nodes

};


/**
 * Parses a MIME header line into a dict.
 * @param {string} line The header line to parse.
 * @return {{name: string, value: string, params: Object}}
 */
ext.mime.utils.parseHeaderLine = function(line) {
  var header = {};
  var parts = line.split('; ');

  // Ex: 'Content-Type: multipart/encrypted'
  var firstPart = parts.shift();
  var mainHeaderParts = firstPart.split(': ');
  if (mainHeaderParts.length < 2) {
    return header;
  }

  header.name = mainHeader.shift();
  header.value = mainHeader.join('').toLowerCase();

  header.params = {};
  goog.array.forEach(parts, function(part) {
    // Ex: 'protocol=application/pgp-encrypted'
    var paramParts = part.split('=');
    if (paramParts.length < 2) {
      return;
    }
    var paramName = paramParts.shift().toLowerCase();
    header.params[paramName] = paramParts.join('').toLowerCase();
  });
};


/**
 * Handle failure to parse MIME content.
 * @private
 */
ext.mime.utils.fail_ = function() {
  throw new e2e.error.UnsupportedError('Unsupported MIME content');
};
