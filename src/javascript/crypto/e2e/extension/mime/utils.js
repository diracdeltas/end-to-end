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
goog.require('goog.string');

goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;
var utils = e2e.ext.mime.utils;


/**
 * Extracts the encrypted MIME tree out of PGP/MIME email text.
 * @param {string} text The text to parse.
 * @return {string}
 */
ext.mime.utils.getEncryptedMimeTree = function(text) {
  var boundary;
  var line;

  var ctHeader = utils.parseHeader(text)[constants.Mime.CONTENT_TYPE];
  var lines = utils.splitLines_(text);

  // Parse the Content-Type header. Ignore other headers for now.
  if (!ctHeader || !ctHeader.params ||
      !ctHeader.params.boundary ||
      ctHeader.value !== constants.Mime.MULTIPART_ENCRYPTED ||
      ctHeader.params.protocol !== constants.Mime.ENCRYPTED) {
    // This does not appear to be a valid PGP encrypted MIME message.
    utils.fail_();
  } else {
    boundary = '--' + ctHeader.params.boundary;
    // Ignore all lines after the end boundary
    lines = utils.stripEndLines_(lines, ctHeader.params.boundary);
    // Ignore the rest of the headers
    do {
      line = lines.shift();
    } while (line !== boundary);
    // Next node is the required 'application/pgp-encrypted' version node.
    ctHeader = utils.parseHeader(utils.joinLines_(lines))[
      constants.Mime.CONTENT_TYPE];
    if (!ctHeader || ctHeader.value !== constants.Mime.ENCRYPTED) {
      utils.fail_();
    } else {
      // Ignore the rest of the node
      do {
        line = lines.shift();
      } while (line !== boundary);
      // Next node is the actual encrypted content.
      ctHeader = utils.parseHeader(utils.joinLines_(lines))[
        constants.Mime.CONTENT_TYPE];
      if (!ctHeader || ctHeader.value !== constants.Mime.OCTET_STREAM) {
        utils.fail_();
      } else {
        // Ignore the rest of the headers
        do {
          line = lines.shift();
        } while (line !== '');
        // Return the encrypted body
        return utils.joinLines_(lines);
      }
    }
  }
};


/**
 * Extracts mail content out of a plaintext MIME tree.
 * @param {string} text The text to parse
 * @return {e2e.ext.mime.types.MailContent}
 */
ext.mime.utils.getMailContent = function(text) {
  var content = {};
  var line;
  var lines = utils.splitLines_(text);

  var ctHeader = utils.parseHeader(text)[constants.Mime.CONTENT_TYPE];
  if (!ctHeader) {
    utils.fail_();
  }

  // Case 1: Single plaintext node.
  if (ctHeader.value === constants.Mime.PLAINTEXT) {
    content.body = utils.getContentFromTextNode_(lines);
    return content;
  }

  // Case 2: Multipart node
  if (ctHeader.value === constants.Mime.MULTIPART_MIXED &&
      ctHeader.params &&
      ctHeader.params.boundary) {
    content.attachments = [];

    // Ignore all lines after the end boundary
    lines = utils.stripEndLines_(lines, ctHeader.params.boundary);

    // Split text into node chunks
    var nodes = utils.joinLines_(lines).split('--' + boundary);

    goog.array.forEach(nodes, goog.bind(function(node) {
      var nodeLines = utils.splitLines_(node);
      if (utils.isTextNode_(node)) {
        content.body = utils.getContentFromTextNode_(nodeLines);
      } else if (utils.isAttachmentNode_(node)) {
        try {
          content.attachments.push(
            utils.getContentFromAttachmentNode_(nodeLines));
        } catch(e) {
        }
      }
    }, this));

    return content;
  }

  // If neither Case 1 or 2, MIME tree is unsupported.
  utils.fail_();
};


/**
 * Strips lines after the MIME boundary.
 * @param {Array.<string>} lines The lines of the MIME message.
 * @param {string} boundary The boundary parameter, as specified in the MIME
 *   header
 * @return {Array.<string>}
 * @private
 */
ext.mime.utils.stripEndLines_ = function(lines, boundary) {
  var endLocation = goog.array.indexOf(lines, '--' + boundary + '--');
  if (endLocation === -1) {
    utils.fail_();
  }
  return goog.array.slice(lines, 0, endLocation);
};


/**
 * Determines if a node is a text node.
 * @param {string} text
 * @return {boolean}
 * @private
 */
ext.mime.utils.isTextNode_ = function(text) {
  var ctHeader = utils.parseHeader(text)[constants.Mime.CONTENT_TYPE];
  return ctHeader && ctHeader.value === constants.Mime.PLAINTEXT;
};


/**
 * Determins if a node is an attachment node.
 * @param {string} text
 * @return {boolean}
 * @private
 */
ext.mime.utils.isAttachmentNode_ = function(text) {
  var ctHeader = utils.parseHeader(text)[constants.Mime.CONTENT_TYPE];
  return ctHeader && ctHeader.value === constants.Mime.OCTET_STREAM;
};


/**
 * Extracts text content from a plaintext node.
 * @param {Array.<string>} lines
 * @return {string}
 * @private
 */
ext.mime.utils.getContentFromTextNode_ = function(lines) {
  do {
    line = lines.shift();
  } while (line !== '');
  return lines.join('');
};


/**
 * Extract attachment content from an attachment node.
 * @param {Array.<string>} lines
 * @return {e2e.ext.mime.types.Attachment}
 * @private
 */
ext.mime.utils.getContentFromAttachmentNode_ = function(lines) {
  var body;
  var filename;
  var base64 = false;
  var text = utils.joinLines_(lines);

  var headers = utils.parseHeader(text);
  try {
    base64 = (headers[constants.Mime.CONTENT_TRANSFER_ENCODING].value ===
              constants.Mime.BASE64);
    filename = headers[constants.Mime.CONTENT_DISPOSITION].params.filename;
  } catch (e) {
    utils.fail_();
  }

  var content = text.split(constants.Mime.CRLF + constants.Mime.CRLF)[1];

  if (!base64 || !content) {
    utils.fail_();
  }

  return {filename: filename,
          content: goog.crypt.base64.decodeStringToByteArray(content)};
};


/**
 * Parses a MIME header line into a dict.
 * @param {string} line The header line to parse.
 * @return {{name: string, value: string, params: Object.<string, string>}}
 * @private
 */
ext.mime.utils.parseHeaderLine_ = function(line) {
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
  goog.array.forEach(parts, goog.bind(function(part) {
    // Ex: 'protocol=application/pgp-encrypted'
    var paramParts = part.split('=');
    if (paramParts.length < 2) {
      return;
    }
    var paramName = paramParts.shift().toLowerCase();
    header.params[paramName] = paramParts.join('').toLowerCase();
  }, this));
};


/**
 * Extracts MIME headers from a MIME message.
 * @param {string} text The MIME-formatted message.
 * @return {Object.<string, {value: string, params: Object.<string, string>}>}
 */
ext.mime.utils.parseHeader = function(text) {
  // Headers are separated from body by an empty line, according to RFC 2822
  var header = text.split(constants.Mime.CRLF + constants.Mime.CRLF)[0];
  var parsed = {};
  if (!header) {
    return parsed;
  }
  var headerLines = utils.splitLines_(header);
  goog.array.forEach(headerLines, goog.bind(function(line) {
    var parsedLine = utils.parseHeaderLine_(line);
    if (parsedLine && parsedLine.name) {
      parsed[parsedLine.name] = parsedLine[parsedLine.name];
    }
  }, this));
  return parsed;
};


/**
 * Handle failure to parse MIME content.
 * @private
 */
ext.mime.utils.fail_ = function() {
  throw new e2e.error.UnsupportedError('Unsupported MIME content');
};


/**
 * Splits a MIME message into lines.
 * @param {string} text The message to split
 * @return {Array.<string>}
 * @private
 */
ext.mime.utils.splitLines_ = function(text) {
  return text.split(constants.Mime.CRLF);
};


/**
 * Joins a split MIME message.
 * @param {Array.<string>} lines The lines to join
 * @return {string}
 * @private
 */
ext.mime.utils.joinLines_ = function(lines) {
  return lines.join(constants.Mime.CRLF);
};

});  // goog.scope
