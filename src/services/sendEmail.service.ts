import { AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, DEV_EMAIL, DEV_EMAIL_PASSWORD, NODE_ENV, REDIRECT_EMAIL } from '@/config/index';
import { HttpException } from '@/exceptions/HttpException';
import AWS from 'aws-sdk';
import { SendEmailRequest } from 'aws-sdk/clients/ses';
import nodemailer from 'nodemailer';

/**
 * Sends email using AWS SES for production and Nodemailer for development.
 * @param {Array} recipients - List of recipient email addresses.
 * @param {String} subject - Email subject.
 * @param {String} template - Email body (HTML).
 * @param {Array} ccRecipients - List of CC email addresses.
 * @param {Array} bccRecipients - List of BCC email addresses (optional).
 */
const sendEmail = (recipients: string[], subject: string, template: string, ccRecipients: string[], bccRecipients?: string[]) => {
  let destinationEmail = [];
  let ccDestinationEmail = [];
  let bccDestinationEmail = [];
  let subjectDestination = subject;

  if (NODE_ENV === 'production') {
    // Use AWS SES in production
    destinationEmail = recipients;
    ccDestinationEmail = ccRecipients;
    bccDestinationEmail = bccRecipients;
  } else if (!REDIRECT_EMAIL && NODE_ENV !== 'production') {
    // Use Nodemailer in development
    throw new Error('REDIRECT_EMAIL is not defined for ' + NODE_ENV + ' environment.');
  } else {
    destinationEmail = [REDIRECT_EMAIL];
    ccDestinationEmail = [REDIRECT_EMAIL];
    bccDestinationEmail = [REDIRECT_EMAIL];

    if (!recipients.length) {
      throw new Error('No recipients defined');
    }
    subjectDestination = (subjectDestination + `[To:${(recipients || []).join()}] [CC:${(ccRecipients || []).toString()}]`).slice(0, 254);
  }

  return new Promise((resolve, reject) => {
    try {
      if (NODE_ENV === 'production') {
        // AWS SES Configuration
        const SES_CONFIG = {
          accessKeyId: AWS_SES_ACCESS_KEY_ID,
          secretAccessKey: AWS_SES_SECRET_ACCESS_KEY,
          region: 'ap-south-1',
        };

        const ses = new AWS.SES(SES_CONFIG);
        const params: SendEmailRequest = {
          Destination: {
            ToAddresses: destinationEmail,
            CcAddresses: ccDestinationEmail || [],
            BccAddresses: bccDestinationEmail || [],
          },
          Message: {
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: template,
              },
            },
            Subject: {
              Charset: 'UTF-8',
              Data: subjectDestination,
            },
          },
          Source: 'no-reply@localShop.com',
        };

        const sendEmail = async () => await ses.sendEmail(params).promise();
        sendEmail();
        resolve('ok');
      } else {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: DEV_EMAIL,
            pass: DEV_EMAIL_PASSWORD,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });

        const mailOptions = {
          from: DEV_EMAIL, // Sender address
          to: destinationEmail.join(', '), // Recipient(s)
          cc: ccDestinationEmail.join(', '), // CC
          bcc: bccDestinationEmail.join(', '), // BCC
          subject: subjectDestination,
          html: template,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            return reject(new HttpException(500, error.message || 'Something went wrong with Nodemailer'));
          }
          resolve(`Email sent successfully using Nodemailer: ${info.response}`);
        });
      }
    } catch (error: any) {
      return reject(new HttpException(500, error.message || 'Something went wrong in the email send service'));
    }
  });
};

export default sendEmail;
