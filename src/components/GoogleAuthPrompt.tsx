import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { getGoogleUser, setGoogleUser, getAnonId, getUsername } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface GoogleAuthPromptProps {
  onComplete: () => void;
}

function GoogleAuthPrompt({ onComplete }: GoogleAuthPromptProps) {
  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const username = getUsername();
  const anonId = getAnonId();

  const handleGoogleSuccess = async (tokenResponse: any) => {
    setIsGoogleLoading(true);
    setError('');
    try {
      // Get user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });
      const googleUser = await response.json();

      // Store Google user info
      setGoogleUser({
        sub: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        picture: googleUser.picture,
      });

      // Use existing anon_id to link Google auth to existing username
      const existingAnonId = anonId;
      if (!existingAnonId) {
        throw new Error('No existing account found');
      }

      // Update users table with Google info, linking to existing username
      const { error: updateError } = await supabase
        .from('users')
        .upsert({
          anon_id: existingAnonId,
          username: username,
          google_id: googleUser.sub,
          google_email: googleUser.email,
          google_name: googleUser.name,
          google_picture: googleUser.picture,
          email: googleUser.email,
        }, {
          onConflict: 'anon_id'
        });

      if (updateError) throw updateError;

      // Update all submissions to ensure they have the username
      if (username) {
        await supabase
          .from('submissions')
          .update({ username: username })
          .eq('anon_id', existingAnonId)
          .is('username', null);
      }

      onComplete();
    } catch (error) {
      console.error('Error with Google login:', error);
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => {
      setError('Failed to sign in with Google. Please try again.');
      setIsGoogleLoading(false);
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Connect Your Google Account 🔐
        </h2>
        <p className="text-gray-600 mb-4">
          To continue playing as <span className="font-semibold">{username}</span>, please sign in with Google to secure your account.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          This will link your Google account to your existing username and all your progress.
        </p>
        
        <div className="mb-4">
          <button
            onClick={() => {
              setIsGoogleLoading(true);
              googleLogin();
            }}
            disabled={isGoogleLoading}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-50 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {isGoogleLoading ? (
              <>Loading...</>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}

export default GoogleAuthPrompt;

