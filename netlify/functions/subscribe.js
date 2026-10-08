import { generateSubscription } from '../../core/generator.js';

export const handler = async (event) => {
  const token = event.queryStringParameters.token;
  
  if (token !== process.env.SUB_TOKEN) {
    return { statusCode: 403, body: 'Access Denied' };
  }

  const subscriptionContent = generateSubscription();
  
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/plain",
      "profile-update-interval": "24"
    },
    body: subscriptionContent
  };
};
