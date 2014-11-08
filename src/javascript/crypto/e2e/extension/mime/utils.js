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
 * @return {(string|undefined)}
 */
ext.mime.utils.getEncryptedMimeTree = function(text) {
  var boundary;
  var endLocation;
  var lines = text.split(constants.Mime.CRLF);

  var line = lines.shift();

  // Parse the Content-Type header. Ignore other headers for now.
  var ctHeader = utils.parseHeaderLine(line);
  if (!utils.validateContentTypeHeader_(ctHeader) ||
      !ctHeader.params.boundary ||
      ctHeader.value !== constants.Mime.MULTIPART_ENCRYPTED ||
      ctHeader.params.protocol !== constants.Mime.ENCRYPTED) {
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
    ctHeader = utils.parseHeaderLine(lines.shift());
    if (!utils.validateContentTypeHeader_(ctHeader) ||
        ctHeader.value !== constants.Mime.ENCRYPTED) {
      utils.fail_();
    } else {
      // Ignore the rest of the node
      do {
        line = lines.shift();
      } while (line !== boundary);
      // Next node is the actual encrypted content.
      ctHeader = utils.parseHeaderLine(lines.shift());
      if (!utils.validateContentTypeHeader_(ctHeader) ||
          ctHeader.value !== constants.Mime.OCTET_STREAM) {
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


/**
 * Extracts mail content out of a plaintext MIME tree.
 * @param {string} text The text to parse
 * @return {Array.<!e2e.ext.mime.types.MailContent>}
 */
ext.mime.utils.getMailContent = function(text) {
  var content = {};
  var boundary;
  var endLocation;
  var lines = text.split(constants.Mime.CRLF);

  var line = lines.shift();
  var ctHeader = utils.parseHeaderLine(line);
  if (!utils.validateContentTypeHeader_(ctHeader)) {
    utils.fail_();
    return;
  }

  // Case 1: Single plaintext node.
  if (ctHeader.value === constants.Mime.PLAINTEXT) {
    content.body = utils.getContentFromTextNode_(lines);
    return content;
  }

  // Case 2: Multipart node
  if (ctHeader.value === constants.Mime.MULTIPART_MIXED &&
      ctHeader.params.boundary) {
    boundary = '--' + ctHeader.params.boundary;
    content.attachments = [];

    // Ignore all lines after the end boundary
    endLocation = goog.array.indexOf(lines, boundary + '--');
    if (endLocation === -1) {
      utils.fail_();
      return;
    }
    lines = goog.array.slice(lines, 0, endLocation);

    // Split text into node chunks
    var nodes = lines.join(constants.Mime.CRLF).split(boundary);

    goog.array.forEach(nodes, function(node) {
      var lines = node.split(constants.Mime.CRLF);
      if (utils.isTextNode_(lines)) {
        content.body = utils.getContentFromTextNode_(lines);
      } else if (utils.isAttachmentNode_(lines)) {
        try {
          content.attachments.push(utils.getContentFromAttachmentNode_(lines));
        } catch(e) {
          utils.fail_();
        }
      }
    });

    return content;
  }

  // If neither Case 1 or 2, MIME tree is unsupported.
  utils.fail_();
};


/**
 * Determines if a node is a text node.
 * @param {Array} lines
 * @return {boolean}
 * @private
 */
ext.mime.utils.isTextNode_ = function(lines) {
  var ctHeader = utils.parseHeaderLine(lines[0]);
  return utils.validateContentTypeHeader_(ctHeader) &&
    ctHeader.value === constants.Mime.PLAINTEXT;
};


/**
 * Determins if a node is an attachment node.
 * @param {Array} lines
 * @return {boolean}
 * @private
 */
ext.mime.utils.isAttachmentNode_ = function(lines) {
  var ctHeader = utils.parseHeaderLine(lines[0]);
  return utils.validateContentHeader_(ctHeader) &&
    ctHeader.value === constants.Mime.OCTET_STREAM;
};


/**
 * Extracts text content from a plaintext node.
 * @param {Array} lines
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
 * @param {Array} lines
 * @return {e2e.ext.mime.types.Attachment}
 * @private
 */
ext.mime.utils.getContentFromAttachmentNode_ = function(lines) {
  var headers = [];
  var body;
  var line = lines.shift();
  while (line !== '') {
    headers.push(utils.parseHeaderLine(line));
    line = lines.shift();
  }

  var filename;
  var base64 = false;

  goog.array.forEach(headers, function(header) {
    if (header.name === constants.Mime.CONTENT_TRANSFER_ENCODING) {
      base64 = (header.value === constants.Mime.BASE64);
    } else if (header.name === constants.Mime.CONTENT_DISPOSITION) {
      filename = content.params.filename;
    }
  });

  if (!goog.isString(filename) || !base64) {
    utils.fail_();
  }
  body = goog.crypt.base64.decodeStringToByteArray(lines.join(''));

  return {filename: filename, content: body};
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
 * Validates a parsed Content-Type header.
 * @param {Object} header The header to validate
 * @return {boolean}
 * @private
 */
ext.mime.utils.validateContentTypeHeader_ = function(header) {
  return (header && header.params &&
          header.name === constants.Mime.CONTENT_TYPE);
};


/**
 * Handle failure to parse MIME content.
 * @private
 */
ext.mime.utils.fail_ = function() {
  throw new e2e.error.UnsupportedError('Unsupported MIME content');
};

});  // goog.scope
