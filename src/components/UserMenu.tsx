import { useState, useRef, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { logout, getGoogleUser, setGoogleUser, getAnonId, setAnonId } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface UserMenuProps {
  username: string | null;
  onLogout: () => void;
  onChangeUsername: () => void;
}

function UserMenu({ username, onLogout, onChangeUsername }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const googleUser = getGoogleUser();

  const handleGoogleSuccess = async (tokenResponse: any) => {
    setIsGoogleLoading(true);
    try {
      // Get user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });
      const googleUserData = await response.json();

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
          email: googleUserData.email,
        }, {
          onConflict: 'anon_id'
        });

      setIsOpen(false);
      // Refresh the page to update the UI
      window.location.reload();
    } catch (error) {
      console.error('Error with Google login:', error);
      alert('Failed to connect Google account. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => {
      alert('Failed to sign in with Google. Please try again.');
      setIsGoogleLoading(false);
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    onLogout();
    setIsOpen(false);
  };

  const handleChangeUsername = () => {
    onChangeUsername();
    setIsOpen(false);
  };

  if (!username) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-1 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
      >
        {googleUser?.picture ? (
          <img
            src={googleUser.picture}
            alt={username}
            className="h-5 w-5 sm:h-6 sm:w-6 rounded-full mr-1 sm:mr-2"
          />
        ) : null}
        <span className="truncate max-w-[80px] sm:max-w-none">{username}</span>
        <svg
          className={`ml-1 h-3 w-3 sm:h-4 sm:w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-900">{username}</p>
            {googleUser?.email && (
              <p className="text-xs text-gray-500 truncate">{googleUser.email}</p>
            )}
          </div>
          <button
            onClick={handleChangeUsername}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Change Username
          </button>
          {!googleUser && (
            <button
              onClick={() => {
                setIsGoogleLoading(true);
                googleLogin();
              }}
              disabled={isGoogleLoading}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {isGoogleLoading ? 'Connecting...' : 'Connect Google Account'}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

export default UserMenu;

