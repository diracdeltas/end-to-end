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
 * @fileoverview PGP/MIME email builder (RFC 2822, RFC 3156).
 * @author yzhu@yahoo-inc.com (Yan Zhu)
 */

goog.provide('e2e.ext.mime.PgpMail');

goog.require('e2e.openpgp.ContextImpl');
goog.require('e2e.ext.constants');
goog.require('e2e.ext.messages');
goog.require('e2e.ext.mime.types');
goog.require('goog.array');


goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;
var messages = e2e.ext.messages;
var mime = e2e.ext.mime;



/**
 * Constructs a PGP/MIME email.
 * @param {!mime.types.MailContent} content The content of the email.
 * @param {!e2e.ext.actions.Executor} actionExecutor Executor for the End-to-
 *   End actions.
 * @param {string} currentUser The author of the email.
 * @param {boolean} signMessage Whether the message should be signed.
 * @param {Array=} opt_recipients The recipients of the email.
 * @param {Array=} opt_passphrases Additional passphrases for encryption.
 * @constructor
 */
ext.mime.PgpMail = function(content, actionExecutor, currentUser,
                            signMessage, opt_recipients, opt_passphrases) {
  this.recipients = opt_recipients;
  this.passphrases = opt_passphrases;
  this.signMessage = signMessage;
  this.actionExecutor_ = actionExecutor;
  this.originalContent = content;
  this.currentUser = currentUser;
};


/**
 * Processes email into an encrypted MIME tree.
 */
ext.mime.PgpMail.buildSignedEncryptedTree = function(callback) {
  var mimetree = this.buildMimeTree_(this.originalContent);
  var request = /** @type {!messages.ApiRequest} */ ({
    action: constants.Actions.ENCRYPT_SIGN,
    content: mimetree,
    signMessage: this.signMessage,
    currentUser: this.currentUser,
    recipients: this.recipients,
    encryptPassphrases: this.passphrases
  });
  this.actionExecutor_.execute(request, this, goog.bind(function(encrypted) {
    var encryptedTree = this.buildEncryptedMimeTree_(encrypted);
    callback(encryptedTree);
  }, this));
};


/**
 * Create a plaintext MIME tree for the email.
 * @param {!mime.types.MailContent} content The plaintext content of the email.
 * @return {string}
 */
ext.mime.PgpMail.buildMimeTree_ = function(content) {
  var rootNode = new mime.MimeNode();
  if (!content.attachments || content.attachments.length === 0) {
    // Create a single plaintext node. TODO: Support 7-bit transfer encoding.
    rootNode.setHeader(constants.Mime.CONTENT_TYPE, constants.Mime.PLAINTEXT);
    rootNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                       constants.Mime.SEVEN_BIT);
    rootNode.setContent(content.body);
  } else {
    rootNode.setHeader(constants.Mime.CONTENT_TYPE,
                       constants.Mime.MULTIPART_MIXED);

    var textNode = rootNode.createChild(constants.Mime.PLAINTEXT);
    textNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                       constants.Mime.SEVEN_BIT);
    textNode.setContent(content.body);

    goog.array.forEach(content.attachments, function(attachment) {
      var contentType = constants.Mime.OCTET_STREAM;
      var ctEncoding = constants.Mime.BASE64;
      var filename = attachment.filename;

      var attachmentNode = rootNode.createChild(contentType, filename);
      attachmentNode.setHeader(constants.Mime.CONTENT_TYPE, contentType);
      attachmentNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                               ctEncoding);
      attachmentNode.setContent(attachment.content);
    });
  }
  return rootNode.buildMessage();
};


/**
 * Builds a MIME tree for PGP-encrypted content, according to RFC 3156.
 * @param {string} encrypted The PGP-encrypted content.
 * @return {string}
 */
ext.mime.PgpMail.buildEncryptedMimeTree_ = function(encrypted) {
  // Build the top-level node
  var rootNode = new mime.MimeNode();
  rootNode.setHeader(constants.Mime.CONTENT_TYPE,
                     constants.Mime.MULTIPART_ENCRYPTED);
  rootNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                     constants.Mime.SEVEN_BIT);

  // Set the required version info.
  var versionNode = rootNode.createChild(constants.Mime.PGP_ENCRYPTED);
  versionNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                        constants.Mime.SEVEN_BIT);
  versionNode.setContent(constants.Mime.VERSION_CONTENT);

  // Set the ciphertext
  var contentNode = rootNode.createChild(constants.Mime.OCTET_STREAM);
  contentNode.setHeader(constants.Mime.CONTENT_TRANSFER_ENCODING,
                        constants.Mime.SEVEN_BIT);
  contentNode.setContent(encrypted);

  return rootNode.buildMessage();
};

});  // goog.scope
