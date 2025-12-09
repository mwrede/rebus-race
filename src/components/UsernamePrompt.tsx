import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { setUsername, setGoogleUser, getGoogleUser, getAnonId, setAnonId, hasGoogleAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface UsernamePromptProps {
  onComplete: (username: string) => void;
}

function UsernamePrompt({ onComplete }: UsernamePromptProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const googleUser = getGoogleUser();

  const checkUsernameAvailability = async (username: string): Promise<boolean> => {
    try {
      // Check if username already exists in submissions (case-insensitive)
      // Get all usernames and check case-insensitively
      const { data, error } = await supabase
        .from('submissions')
        .select('username')
        .not('username', 'is', null);

      if (error) throw error;

      // Check if any username matches case-insensitively
      const usernameLower = username.toLowerCase();
      const isTaken = data?.some((submission: { username: string }) => 
        submission.username && submission.username.toLowerCase() === usernameLower
      );

      // Username is available if not taken
      return !isTaken;
    } catch (error) {
      console.error('Error checking username availability:', error);
      // On error, allow the username (better UX than blocking)
      return true;
    }
  };

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
      const googleUserData = await response.json();

      // Check if this Google email already exists in the database
      const { data: existingUser, error: lookupError } = await supabase
        .from('users')
        .select('anon_id, username, google_id, google_email')
        .eq('google_email', googleUserData.email)
        .single();

      if (lookupError && lookupError.code !== 'PGRST116') {
        // PGRST116 is "not found" which is fine, but other errors are not
        throw lookupError;
      }

      // If user exists with this Google email, auto-login them
      if (existingUser && existingUser.username) {
        // Store Google user info
        setGoogleUser({
          sub: googleUserData.sub,
          email: googleUserData.email,
          name: googleUserData.name,
          picture: googleUserData.picture,
        });

        // Set the existing anon_id and username
        setAnonId(existingUser.anon_id);
        localStorage.setItem('rebus_anon_id', existingUser.anon_id);
        setUsername(existingUser.username);

        // Update Google info in case it changed
        await supabase
          .from('users')
          .update({
            google_id: googleUserData.sub,
            google_email: googleUserData.email,
            google_name: googleUserData.name,
            google_picture: googleUserData.picture,
            email: googleUserData.email,
          })
          .eq('anon_id', existingUser.anon_id);

        // Auto-complete with existing username
        onComplete(existingUser.username);
        return;
      }

      // New user - proceed with normal flow
      // Store Google user info
      setGoogleUser({
        sub: googleUserData.sub,
        email: googleUserData.email,
        name: googleUserData.name,
        picture: googleUserData.picture,
      });

      // Ensure we have an anon_id
      let anonId = getAnonId();
      if (!anonId) {
        anonId = crypto.randomUUID();
        setAnonId(anonId);
        // Also set in localStorage for backward compatibility
        localStorage.setItem('rebus_anon_id', anonId);
      }

      // Update users table with Google info
      await supabase
        .from('users')
        .upsert({
          anon_id: anonId,
          google_id: googleUserData.sub,
          google_email: googleUserData.email,
          google_name: googleUserData.name,
          google_picture: googleUserData.picture,
          email: googleUserData.email, // Also set email field
        }, {
          onConflict: 'anon_id'
        });

      // Pre-fill username field with Google name if empty
      if (!input.trim()) {
        let defaultUsername = googleUserData.name || googleUserData.email.split('@')[0];
        // Clean username (remove special chars, limit length)
        defaultUsername = defaultUsername.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 20).trim();
        if (defaultUsername.length < 2) {
          defaultUsername = googleUserData.email.split('@')[0].substring(0, 20);
        }
        setInput(defaultUsername);
      }
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

  const saveUsername = async (username: string) => {
    const googleUser = getGoogleUser();
    
    // Check if this Google email already has a username
    if (googleUser?.email) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('anon_id, username')
        .eq('google_email', googleUser.email)
        .not('username', 'is', null)
        .single();

      if (existingUser && existingUser.username) {
        // This Google email already has a username - use that account
        setAnonId(existingUser.anon_id);
        localStorage.setItem('rebus_anon_id', existingUser.anon_id);
        setUsername(existingUser.username);
        onComplete(existingUser.username);
        return;
      }
    }

    // Ensure we have an anon_id
    let anonId = getAnonId();
    if (!anonId) {
      anonId = crypto.randomUUID();
      setAnonId(anonId);
      // Also set in localStorage for backward compatibility
      localStorage.setItem('rebus_anon_id', anonId);
    }

    // Save to users table
    await supabase
      .from('users')
      .upsert({
        anon_id: anonId,
        username: username,
        google_id: googleUser?.sub || null,
        google_email: googleUser?.email || null,
        google_name: googleUser?.name || null,
        google_picture: googleUser?.picture || null,
        email: googleUser?.email || null,
      }, {
        onConflict: 'anon_id'
      });

    setUsername(username);
    onComplete(username);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Require Google auth first
    if (!hasGoogleAuth()) {
      setError('Please sign in with Google first');
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      setError('Please enter a username');
      return;
    }

    if (trimmed.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    if (trimmed.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }

    // Check for invalid characters (alphanumeric and spaces only)
    if (!/^[a-zA-Z0-9\s]+$/.test(trimmed)) {
      setError('Username can only contain letters, numbers, and spaces');
      return;
    }

    setIsChecking(true);
    const isAvailable = await checkUsernameAvailability(trimmed);
    setIsChecking(false);

    if (!isAvailable) {
      setError('This username is already taken. Please choose another one.');
      return;
    }

    await saveUsername(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Welcome to Rebus Race! 🧩
        </h2>
        <p className="text-gray-600 mb-4">
          Sign in with Google and choose a username to track your scores on the leaderboard.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Step 1: Sign in with Google <span className="text-red-500">*</span>
            </p>
            {googleUser ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-800">
                  Signed in as {googleUser.email}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsGoogleLoading(true);
                  googleLogin();
                }}
                disabled={isGoogleLoading || isChecking}
                className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
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
            )}
          </div>

          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Step 2: Choose a Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="username"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="Enter your username..."
              autoFocus={!!googleUser}
              maxLength={20}
              required
              disabled={!googleUser}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isChecking || isGoogleLoading || !googleUser}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isChecking ? 'Checking...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UsernamePrompt;

