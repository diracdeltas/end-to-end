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
 * @fileoverview MIME nodes for building PGP/MIME emails.
 * @author yzhu@yahoo-inc.com (Yan Zhu)
 */

goog.provide('e2e.ext.mime.MimeNode');

goog.require('e2e.ext.constants.Mime');
goog.require('e2e.ext.constants.mime');
goog.require('goog.array');
goog.require('goog.crypt.base64');
goog.require('goog.object');
goog.require('goog.string');

goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;



/**
 * Constructor for a MIME tree node.
 * @param {{
 *   contentType: string,
 *   contentTransferEncoding: (string|undefined),
 *   multipart: boolean
 * }} options Options to initialize for the node.
 * @param {e2e.ext.mime.MimeNode=} opt_parent The parent node.
 * @param {string=} opt_filename Name of the file, if the node is an attachment.
 *   to false.
 * @constructor
 */
ext.mime.MimeNode = function(options, opt_parent, opt_filename) {
  this.parent = opt_parent || this;
  this.filename = opt_filename;

  this.multipart_ = options.multipart;
  this.headers_ = {};
  this.content_ = null;

  // TODO: Strictly ensure that the boundary value doesn't coincide with
  //   any string in the email content and headers.
  this.boundary_ = goog.string.getRandomString() +
      Math.floor(Date.now() / 1000).toString();

  this.setHeader_(constants.Mime.CONTENT_TYPE, options.contentType);

  if (options.contentTransferEncoding) {
    this.setHeader_(constants.Mime.CONTENT_TRANSFER_ENCODING,
                    options.contentTransferEncoding);
  }
};


/**
 * Adds a child to a MIME node.
 * @param {{
 *   contentType: string,
 *   contentTransferEncoding: (string|undefined),
 *   multipart: boolean
 * }} options Options to initialize for the node.
 * @param {string=} opt_filename Name of the file, if one exists.
 * @return {e2e.ext.mime.MimeNode}
 */
ext.mime.MimeNode.prototype.addChild = function(options, opt_filename) {
  var node = new ext.mime.MimeNode(options, this, opt_filename);
  this.children_.push(node);
  return node;
};


/**
 * Sets a MIME header.
 * @param {string} key Name of the header.
 * @param {string} value Value of the header.
 * @private
 */
ext.mime.MimeNode.prototype.setHeader_ = function(key, value) {
  goog.object.set(this.headers_, key, value);
};


/**
 * Adds parameters to a MIME header. Note: This will not replace a param
 *   if it already exists.
 * @param {string} headerName The name of the header.
 * @param {Object} params The parameter key-value pairs to add.
 * @param {string} value Default value of the header if one doesn't exist.
 * @private
 */
ext.mime.MimeNode.prototype.addHeaderParams_ = function(headerName, params,
                                                        value) {
  var value = goog.object.get(this.headers_, headerName, value);

  var paramsArray = [];
  goog.object.forEach(params, function(paramValue, paramName) {
    if (paramName === 'filename') {
      // TODO: Replace with RFC 2231 compliant encoding.
      paramValue = /[\s";=]/.test(paramValue) ? goog.string.quote(paramValue) :
          paramValue;
    }
    paramsArray.push(paramName + '=' + paramValue);
  });

  if (paramsArray.length !== 0) {
    value = value + '; ' + paramsArray.join('; ');
  }

  this.setHeader_(headerName, value);

};


/**
 * Sets the content.
 * @param {(string|!e2e.byteArray)} content The content to set
 */
ext.mime.MimeNode.prototype.setContent = function(content) {
  this.content_ = content;
};


/**
 * Builds an RFC 2822 message from the node.
 * @return {string}
 */
ext.mime.MimeNode.prototype.buildMessage = function() {
  var lines = [];
  var contentParams = {};
  var transferEncoding =
      this.headers_[constants.Mime.CONTENT_TRANSFER_ENCODING];
  var contentType = this.headers_[constants.Mime.CONTENT_TYPE];

  // Set required header fields
  if (this.filename && !this.headers_[constants.Mime.CONTENT_DISPOSITION]) {
    // Set the correct content disposition header for attachments.
    this.addHeaderParams_(constants.Mime.CONTENT_DISPOSITION,
                          {filename: this.filename},
                          constants.Mime.ATTACHMENT);
  } else if (this.content_ && goog.typeof(this.content_) === 'string') {
    // TODO: Support other charsets.
    contentParams['charset'] = 'utf-8';
  } else if (this.multipart_) {
    // Multipart messages need to specify a boundary
    contentParams['boundary'] = this.boundary_;
  }
  this.addHeaderParams_(constants.mime.CONTENT_TYPE, contentParams,
                        contentType);

  goog.object.forEach(this.headers_, function(headerValue, headerName) {
    // TODO: Wrap lines
    lines.push([headerName, headerValue].join(': '));
  });

  lines.push('');

  if (this.content_) {
    if (transferEncoding === constants.Mime.BASE64 ||
        goog.typeof(this.content_) !== 'string') {
      lines.push(goog.typeof(this.content_) === 'string' ?
                 goog.crypt.base64.encodeString(this.content_) :
                 goog.crypt.base64.encodeByteArray(this.content_));
    } else {
      lines.push(this.content_);
    }
  }

  if (this.multipart_) {
    lines.push('');
    goog.array.forEach(this.children_, function(node) {
      lines.push('--' + this.boundary_);
      lines.push(node.buildMessage());
    });
    lines.push('--' + this.boundary_ + '--');
    lines.push('');
  }

  return lines.join('\r\n');
};

});  // goog.scope
