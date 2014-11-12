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
goog.require('e2e.ext.constants.Mime');
goog.require('goog.array');
goog.require('goog.crypt.base64');

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
  var rootNode = utils.parseNode(text);
  var ctHeader = rootNode.header[constants.Mime.CONTENT_TYPE];

  if (ctHeader.value !== constants.Mime.MULTIPART_ENCRYPTED ||
      !ctHeader.params ||
      ctHeader.params.protocol !== constants.Mime.ENCRYPTED ||
      !goog.isArray(rootNode.content)) {
    // This does not appear to be a valid PGP encrypted MIME message.
    utils.fail_();
  } else {
    // Next node is the required 'application/pgp-encrypted' version node.
    var middleNode = rootNode.content[0];
    ctHeader = middleNode.header[constants.Mime.CONTENT_TYPE];
    if (ctHeader.value !== constants.Mime.ENCRYPTED ||
        !goog.isArray(middleNode.content)) {
      utils.fail_();
    } else {
      // Next node is the actual encrypted content.
      var leafNode = middleNode.content[0];
      ctHeader = leafNode.header[constants.Mime.CONTENT_TYPE];
      if (ctHeader.value !== constants.Mime.OCTET_STREAM ||
          !goog.isString(leafNode.content)) {
        utils.fail_();
      } else {
        return leafNode.content;
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
  var mailContent = {};
  var rootNode = utils.parseNode(text);
  var ctHeader = rootNode.header[constants.Mime.CONTENT_TYPE];

  // Case 1: Single plaintext node.
  if (ctHeader.value === constants.Mime.PLAINTEXT &&
      goog.isString(rootNode.content)) {
    mailContent.body = rootNode.content;
    return mailContent;
  }

  // Case 2: Multipart node
  if (ctHeader.value === constants.Mime.MULTIPART_MIXED &&
      goog.isArray(rootNode.content)) {
    mailContent.attachments = [];

    goog.array.forEach(rootNode.content, goog.bind(function(node) {
      var ct = node.header[constants.Mime.CONTENT_TYPE].value;
      if (!goog.isString(node.content) || !ct) {
        return;
      }
      if (ct === constants.Mime.PLAINTEXT) {
        mailContent.body = utils.getContentFromTextNode_(node);
      } else if (ct === constants.Mime.OCTET_STREAM) {
        try {
          mailContent.attachments.push(
              utils.getContentFromAttachmentNode_(node));
        } catch (e) {
        }
      }
    }, this));

    return mailContent;
  }

  // If neither Case 1 or 2, MIME tree is unsupported.
  utils.fail_();
};


/**
 * Extract attachment content from an attachment node.
 * @param {e2e.ext.mime.types.Node} node
 * @return {e2e.ext.mime.types.Attachment}
 * @private
 */
ext.mime.utils.getContentFromAttachmentNode_ = function(node) {
  var filename;
  var base64 = false;

  try {
    base64 = (node.header[constants.Mime.CONTENT_TRANSFER_ENCODING].value ===
              constants.Mime.BASE64);
    filename = node.header[constants.Mime.CONTENT_DISPOSITION].params.filename;
  } catch (e) {
    utils.fail_();
  }

  if (!base64 || !filename || !goog.isString(node.content)) {
    utils.fail_();
  }

  return {filename: filename,
    content: goog.crypt.base64.decodeStringToByteArray(node.content)};
};


/**
 * Parses MIME headers into a dict.
 * @param {string} text The MIME-formatted message.
 * @return {e2e.ext.mime.types.Header}
 * @private
 */
ext.mime.utils.parseHeader_ = function(text) {
  var parsed = {};
  parsed[constants.Mime.CONTENT_TYPE] = {
    value: constants.Mime.CONTENT_TYPE_DEFAULT};

  var headerLines = utils.splitLines_(text);
  goog.array.forEach(headerLines, goog.bind(function(line) {
    var parts = line.split('; ');

    // Ex: 'Content-Type: multipart/encrypted'
    var firstPart = parts.shift().split(':');
    if (firstPart.length < 2) {
      return;
    }
    var name = firstPart.shift();
    var value = firstPart.join('').toLowerCase().strip();

    var params = {};
    goog.array.forEach(parts, goog.bind(function(part) {
      // Ex: 'protocol=application/pgp-encrypted'
      var paramParts = part.split('=');
      if (paramParts.length < 2) {
        return;
      }
      var paramName = paramParts.shift().toLowerCase();
      params[paramName] = paramParts.join('').toLowerCase().strip();
    }, this));

    parsed[name] = {value: value, params: params};
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


/**
 * Splits a MIME message into nodes separated by the MIME boundary ignoring
 *   all lines after the end boundary.
 * @param {string} text The message to split.
 * @param {string} boundary The boundary parameter, as specified in the MIME
 *   header
 * @return {Array.<string>}
 * @private
 */
ext.mime.utils.splitNodes_ = function(text, boundary) {
  var lines = utils.splitLines_(text);
  var startLocation = goog.array.indexOf(lines, '--' + boundary +
                                         constants.Mime.CRLF);
  var endLocation = goog.array.indexOf(lines, '--' + boundary + '--');
  if (endLocation === -1 || startLocation === -1) {
    utils.fail_();
  }
  // Ignore the epilogue after the end boundary.
  lines = goog.array.slice(lines, 0, endLocation);
  // Ignore the preamble before the first boundary occurrence.
  lines = goog.array.slice(lines, startLocation);

  text = utils.joinLines_(lines);
  return text.split('--' + boundary + constants.Mime.CRLF);
};


/**
 * Parses a MIME node into a header and content. For multipart messages,
 *   the content is an array of child nodes. Otherwise content is a string.
 * @param {string} text The text to parse.
 * @return {e2e.ext.mime.types.Node}
 */
ext.mime.utils.parseNode = function(text) {
  // Header must be separated from body by an empty line
  var parts = text.split(constants.Mime.CRLF + constants.Mime.CRLF);
  if (parts.length < 2) {
    utils.fail_();
  }

  var header = utils.parseHeader_(parts.shift());
  var body = utils.joinLines_(parts);
  var ctHeader = header[constants.Mime.CONTENT_TYPE];

  if (ctHeader.params && ctHeader.params.boundary) {
    // This appears to be a multipart message. Split text by boundary.
    var nodes = utils.splitNodes_(body, ctHeader.params.boundary);
    // Recursively parse nodes
    return {header: header, content: goog.array.map(nodes,
                                                    utils.parseNode)};
  } else {
    return {header: header, content: body};
  }
};

});  // goog.scope
