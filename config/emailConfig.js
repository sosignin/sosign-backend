import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter for sending emails
const createTransporter = () => {
  // Check if credentials are set
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    return null;
  }

  // For Gmail SMTP - use port 587 with TLS (more compatible with hosting providers)
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // use STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
      },
      tls: {
        rejectUnauthorized: false // Accept self-signed certificates
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000,
      debug: true,
      logger: true,
    });
  }

  // For custom SMTP
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Email template for petition notifications
export const createPetitionEmailTemplate = (petition, petitionUrl) => {
  return {
    subject: `New Petition Created: ${petition.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Petition Notification</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #3650AD;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #3650AD;
            margin-bottom: 10px;
          }
          .content {
            margin-bottom: 30px;
          }
          .petition-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #3650AD;
          }
          .petition-title {
            font-size: 18px;
            font-weight: bold;
            color: #3650AD;
            margin-bottom: 10px;
          }
          .petition-details {
            margin: 10px 0;
          }
          .cta-button {
            display: inline-block;
            background-color: #3650AD;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s;
          }
          .cta-button:hover {
            background-color: #2a3d8a;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
          }
          .signature {
            margin-top: 20px;
            font-style: italic;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">SOSIGN</div>
            <h1>New Petition Notification</h1>
          </div>
          
          <div class="content">
            <p>Dear Decision Maker,</p>
            
            <p>You are receiving this message because a new petition has been created that requires your attention as a key decision maker.</p>
            
            <div class="petition-info">
              <div class="petition-title">${petition.title}</div>
              <div class="petition-details">
                <strong>Country:</strong> ${petition.country}<br>
                <strong>Created by:</strong> ${petition.petitionStarter.name || 'Anonymous'}<br>
                <strong>Created on:</strong> ${new Date(petition.createdAt).toLocaleDateString()}
              </div>
            </div>
            
            <p>This petition addresses important issues that may require your attention and response. We encourage you to review the petition details and consider the concerns raised by the community.</p>
            
            <div style="text-align: center;">
              <a href="${petitionUrl}" class="cta-button">View Petition Details</a>
            </div>
            
            <p>Thank you for your attention to this matter. Your response and engagement with community concerns are greatly appreciated.</p>
            
            <div class="signature">
              <p>Best regards,<br>
              The SOSIGN Team</p>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from SOSIGN. Please do not reply to this email.</p>
            <p>If you have any questions, please contact us through our official channels.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      New Petition Created: ${petition.title}
      
      Dear Decision Maker,
      
      You are receiving this message because a new petition has been created that requires your attention as a key decision maker.
      
      Petition Details:
      - Title: ${petition.title}
      - Country: ${petition.country}
      - Created by: ${petition.petitionStarter.name || 'Anonymous'}
      - Created on: ${new Date(petition.createdAt).toLocaleDateString()}
      
      View the petition: ${petitionUrl}
      
      This petition addresses important issues that may require your attention and response. We encourage you to review the petition details and consider the concerns raised by the community.
      
      Thank you for your attention to this matter.
      
      Best regards,
      The SOSIGN Team
    `
  };
};

// Function to send email
export const sendEmail = async (to, subject, html, text) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('SMTP Transporter not created: EMAIL_USER or EMAIL_PASSWORD not set in environment.');
      return { success: false, error: 'SMTP credentials not configured' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: to,
      subject: subject,
      html: html,
      text: text,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Function to send petition notification emails
export const sendPetitionNotificationEmails = async (petition, frontendUrl) => {
  try {
    // Create petition URL
    const petitionUrl = `${frontendUrl}/currentpetitions/${petition._id}`;

    // Get email template
    const emailTemplate = createPetitionEmailTemplate(petition, petitionUrl);

    // Send emails to all decision makers
    const emailPromises = petition.decisionMakers.map(async (decisionMaker) => {
      if (decisionMaker.email) {
        const result = await sendEmail(
          decisionMaker.email,
          emailTemplate.subject,
          emailTemplate.html,
          emailTemplate.text
        );

        if (result.success) {
          console.log(`Email sent successfully to ${decisionMaker.email}`);
        } else {
          console.error(`Failed to send email to ${decisionMaker.email}:`, result.error);
        }

        return {
          email: decisionMaker.email,
          success: result.success,
          error: result.error
        };
      }
      return {
        email: decisionMaker.email || 'No email provided',
        success: false,
        error: 'No email address provided'
      };
    });

    const results = await Promise.all(emailPromises);

    return {
      success: true,
      results: results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    };
  } catch (error) {
    console.error('Error sending petition notification emails:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default { sendEmail, sendPetitionNotificationEmails, createPetitionEmailTemplate };
