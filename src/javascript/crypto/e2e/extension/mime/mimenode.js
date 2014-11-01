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

goog.provide('e2e.ext.extension.mime.Node');

goog.require('e2e.ext.constants');
goog.require('goog.object');
goog.require('goog.string');

goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;
var mime = e2e.ext.mime;



/**
 * Constructor for a MIME tree node.
 * @param {e2e.ext.mime.MimeNode} opt_parent The parent node.
 * @param {string=} opt_contentType The contentType of the node, if known.
 * @param {string=} opt_filename Name of the file, if the node is an attachment.
 * @constructor
 */
ext.mime.MimeNode = function(opt_parent, opt_contentType, opt_filename) {
  options = options || {};

  this.parent = opt_parent || this;
  this.filename = opt_filename;

  this.headers_ = {};
  this.content_ = null;
  this.boundary_ = '';

  if (opt_contentType) {
    this.setHeader(constants.Mime.CONTENT_TYPE, opt_contentType);
  }
};


/**
 * Adds a child to a MIME node.
 * @param {string=} opt_contentType The contentType of the node, if known.
 * @param {string=} opt_filename Name of the file, if one exists.
 * @return {e2e.ext.mime.MimeNode}
 */
ext.mime.MimeNode.prototype.createChild = function(opt_contentType,
                                                   opt_filename) {
  var node = new ext.mime.MimeNode(this, opt_contentType, opt_filename);
  return node;
};


/**
 * Sets a MIME header.
 * @param {string} key Name of the header.
 * @param {string} value Value of the header.
 */
ext.mime.prototype.setHeader = function(key, value) {
  goog.object.set(this.headers_, key, value);
};


/**
 * Adds parameters to a MIME header value.
 * @param {string} value The original value of the header.
 * @param {Object} params The parameter key-value pairs to add.
 */
ext.mime.prototype.addParams_ = function(value, params) {
  var paramsArray = [];
  goog.object.forEach(params, function(paramValue, paramName) {
    if (paramName === 'filename') {
      // TODO: Replace with RFC 2231 compliant encoding.
      paramValue = /[\s";=]/.test(paramValue) ? goog.string.quote(paramValue) :
          paramValue;
    }
    paramsArray.push(paramName + '=' + paramValue);
  });

  return value + '; ' + paramsArray.join('; ');
};


/**
 * Sets content disposition for attachments.
 */
ext.mime.prototype.setContentDisposition_ = function() {
  this.setHeader(constants.Mime.CONTENT_DISPOSITION,
                 this.addParams_(constants.Mime.ATTACHMENT,
                                {filename: this.filename})); 
};


/**
 * Sets the content.
 * @param {(string|!e2e.byteArray)} content The content to set
 */
ext.mime.prototype.setContent = function(content) {
  this.content_ = content;
};


/**
 * Builds an RFC 2822 message from the node.
 * @return {string}
 */
ext.mime.prototype.buildMessage = function() {
  var lines = [];
  var contentParams = {};
  var multipart; // TODO: determine if a msg is multipart

  var transferEncoding =
    this.headers_[constants.Mime.CONTENT_TRANSFER_ENCODING];
  var contentType = this.headers_[constants.Mime.CONTENT_TYPE];

  if (this.filename && !this.headers_[constants.Mime.CONTENT_DISPOSITION]) {
    this.setContentDisposition_();
  } else if (goog.typeof(this.content) === 'string') {
    contentParams['charset'] = 'utf-8';
  } else if (multipart) {
    this.boundary_ = goog.string.getRandomString();
    contentParams['boundary'] = this.boundary_;
  }
  this.setHeader(constants.Mime.CONTENT_TYPE,
                 this.addParams_(contentType, contentParams));

  goog.object.forEach(this.headers_, function(headerValue, headerName) {
    lines.push([headerName, headerValue].join(':'));
  });

  lines.push('');

  if (this.content) {
    if (transferEncoding === constants.Mime.BASE64 || 
        goog.typeof(this.content) !=== 'string') {
      lines.push(goog.typeof(this.content) === 'string' ?
                 goog.crypt.base64.encodeString(this.content) :
                 goog.crypt.base64.encodeByteArray(this.content));
    } else {
      lines.push(this.content);
    }
  }

  if (multipart) {
    lines.push('');
    goog.array.forEach(this.childNodes_, function(node) {
      lines.push('--' + this.boundary_);
      lines.push(node.buildMessage());
    });
    lines.push('--' + this.boundary_ + '--');
    lines.push('');
  }

  return lines.join('\r\n');
};

});  // goog.scope
