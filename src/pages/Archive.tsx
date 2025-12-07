import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';
import { getUsername } from '../lib/username';

interface PuzzleWithStats extends Puzzle {
  successRate: number | null;
  averageTime: number | null;
  averageGuesses: number | null;
  totalPlayers: number;
}

// Function to calculate gradient color based on success rate
// 0% = red (hardest), 50% = orange (medium), 100% = green (easiest)
function getDifficultyColor(successRate: number | null): string {
  if (successRate === null) return 'rgb(229, 231, 235)'; // gray for no data
  
  // Clamp between 0 and 100
  const rate = Math.max(0, Math.min(100, successRate));
  
  // Interpolate between red (0%), orange (50%), and green (100%)
  if (rate <= 50) {
    // Red to Orange: 0% = red, 50% = orange
    const ratio = rate / 50;
    const r = Math.round(255 - (255 - 249) * ratio); // 255 -> 249
    const g = Math.round(0 + (140 - 0) * ratio); // 0 -> 140
    const b = Math.round(0 + (20 - 0) * ratio); // 0 -> 20
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Orange to Green: 50% = orange, 100% = green
    const ratio = (rate - 50) / 50;
    const r = Math.round(249 - (249 - 34) * ratio); // 249 -> 34
    const g = Math.round(140 + (197 - 140) * ratio); // 140 -> 197
    const b = Math.round(20 - (20 - 94) * ratio); // 20 -> 94
    return `rgb(${r}, ${g}, ${b})`;
  }
}

interface PlayedPuzzleInfo {
  time_ms: number;
  is_correct: boolean;
  guess_count: number | null;
}

function Archive() {
  const [puzzles, setPuzzles] = useState<PuzzleWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [playedPuzzleIds, setPlayedPuzzleIds] = useState<Set<string>>(new Set());
  const [playedPuzzleData, setPlayedPuzzleData] = useState<Map<string, PlayedPuzzleInfo>>(new Map());
  const [pausedPuzzleIds, setPausedPuzzleIds] = useState<Set<string>>(new Set());
  const [showPlayed, setShowPlayed] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [puzzleAnswer, setPuzzleAnswer] = useState('');
  const [puzzleImage, setPuzzleImage] = useState<File | null>(null);
  const [submittingPuzzle, setSubmittingPuzzle] = useState(false);
  const [showCreateRebus, setShowCreateRebus] = useState(false);
  const [rebusImage, setRebusImage] = useState<File | null>(null);
  const [rebusAnswer, setRebusAnswer] = useState('');
  const [submittingRebus, setSubmittingRebus] = useState(false);
  const [rebusSubmitted, setRebusSubmitted] = useState(false);

  useEffect(() => {
    loadArchive();
    loadPlayedPuzzles();
    loadPausedPuzzles();
  }, []);

  const loadPausedPuzzles = () => {
    try {
      const pausedIds = new Set<string>();
      
      // Check all localStorage keys for game state
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rebus_game_state_')) {
          try {
            const savedState = localStorage.getItem(key);
            if (savedState) {
              const state = JSON.parse(savedState);
              // Check if state is valid (has puzzleId, isReady, and not expired)
              if (state.puzzleId && state.isReady) {
                const hoursSinceSave = (Date.now() - state.timestamp) / (1000 * 60 * 60);
                if (hoursSinceSave < 24) {
                  pausedIds.add(state.puzzleId);
                }
              }
            }
          } catch (error) {
            // Skip invalid entries
            console.error('Error parsing game state:', error);
          }
        }
      }
      
      setPausedPuzzleIds(pausedIds);
    } catch (error) {
      console.error('Error loading paused puzzles:', error);
    }
  };

  const loadArchive = async () => {
    try {
      // Get today's date in YYYY-MM-DD format (local timezone, no time component)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      
      // Get all puzzles
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Filter to only show puzzles with dates strictly before today
      const filteredPuzzles = (data || []).filter((puzzle: Puzzle) => {
        const puzzleDateStr = puzzle.date.split('T')[0];
        return puzzleDateStr < todayStr;
      });

      // Get success rates, average times, and average guesses for each puzzle
      const puzzlesWithStats = await Promise.all(
        filteredPuzzles.map(async (puzzle: Puzzle) => {
          // Get all submissions for this puzzle
          const { data: submissions, error: subError } = await supabase
            .from('submissions')
            .select('is_correct, time_ms, guess_count')
            .eq('puzzle_id', puzzle.id);

          let successRate: number | null = null;
          let averageTime: number | null = null;
          let averageGuesses: number | null = null;
          const totalPlayers = submissions?.length || 0;
          
          if (!subError && submissions && submissions.length > 0) {
            const correctCount = submissions.filter((s: { is_correct: boolean }) => s.is_correct).length;
            successRate = (correctCount / submissions.length) * 100;
            
            // Calculate average time for correct submissions
            const correctSubmissions = submissions.filter((s: { is_correct: boolean }) => s.is_correct);
            if (correctSubmissions.length > 0) {
              const totalTime = correctSubmissions.reduce((sum: number, s: { time_ms: number }) => sum + s.time_ms, 0);
              averageTime = totalTime / correctSubmissions.length;
            }

            // Calculate average guesses (use guess_count if available, otherwise estimate)
            const submissionsWithGuesses = submissions.filter((s: { guess_count: number | null }) => s.guess_count !== null);
            if (submissionsWithGuesses.length > 0) {
              const totalGuesses = submissionsWithGuesses.reduce((sum: number, s: { guess_count: number | null }) => sum + (s.guess_count || 0), 0);
              averageGuesses = totalGuesses / submissionsWithGuesses.length;
            }
          }

          return {
            ...puzzle,
            successRate,
            averageTime,
            averageGuesses,
            totalPlayers,
          };
        })
      );
      
      setPuzzles(puzzlesWithStats);
    } catch (error) {
      console.error('Error loading archive:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayedPuzzles = async () => {
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) return;

      const { data, error } = await supabase
        .from('submissions')
        .select('puzzle_id, time_ms, is_correct, guess_count')
        .eq('anon_id', anonId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get the most recent submission for each puzzle
      const playedIds = new Set<string>();
      const playedData = new Map<string, PlayedPuzzleInfo>();
      
      data?.forEach((s: { puzzle_id: string; time_ms: number; is_correct: boolean; guess_count: number | null }) => {
        if (!playedIds.has(s.puzzle_id)) {
          playedIds.add(s.puzzle_id);
          playedData.set(s.puzzle_id, {
            time_ms: s.time_ms,
            is_correct: s.is_correct,
            guess_count: s.guess_count,
          });
        }
      });

      setPlayedPuzzleIds(playedIds);
      setPlayedPuzzleData(playedData);
    } catch (error) {
      console.error('Error loading played puzzles:', error);
    }
  };

  const handlePuzzleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!puzzleImage) {
      alert('Please upload an image');
      return;
    }

    setSubmittingPuzzle(true);
    try {
      const username = getUsername();
      const anonId = localStorage.getItem('rebus_anon_id') || null;
      
      // Generate a unique filename
      const timestamp = Date.now();
      const fileExt = puzzleImage.name.split('.').pop();
      const fileName = `puzzle-submission-${timestamp}.${fileExt}`;

      console.log('Submitting puzzle:', {
        answer: puzzleAnswer.trim(),
        hasImage: !!puzzleImage,
        imageSize: puzzleImage.size,
        username: username,
        anon_id: anonId,
      });

      // Upload image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('puzzle-submissions')
        .upload(fileName, puzzleImage, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // If bucket doesn't exist, try to create it or use a different approach
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('puzzle-submissions')
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // Save submission to database
      const { error: dbError } = await supabase
        .from('puzzle_submissions')
        .insert({
          answer: puzzleAnswer.trim() || null,
          image_url: imageUrl,
          submitted_at: new Date().toISOString(),
          username: username || null,
          anon_id: anonId,
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }

      alert('Thank you for your puzzle submission!');
      setPuzzleAnswer('');
      setPuzzleImage(null);
      setShowSubmitModal(false);
    } catch (error: any) {
      console.error('Error submitting puzzle:', error);
      // If storage bucket doesn't exist, try saving just the metadata
      if (error.message?.includes('Bucket not found') || error.message?.includes('The resource was not found')) {
        try {
          const username = getUsername();
          const anonId = localStorage.getItem('rebus_anon_id') || null;
          
          // Save to database with a note that image upload failed
          const { error: dbError } = await supabase
            .from('puzzle_submissions')
            .insert({
              answer: puzzleAnswer.trim() || null,
              image_url: null,
              submitted_at: new Date().toISOString(),
              notes: 'Image upload failed - storage bucket may need to be created',
              username: username || null,
              anon_id: anonId,
            });

          if (dbError) {
            throw dbError;
          }

          alert('Puzzle submitted (image upload failed - please check Supabase storage bucket setup)');
          setPuzzleAnswer('');
          setPuzzleImage(null);
          setShowSubmitModal(false);
        } catch (dbError) {
          alert('Failed to submit puzzle. Please try again or contact support.');
        }
      } else {
        alert('Failed to submit puzzle. Please try again.');
      }
    } finally {
      setSubmittingPuzzle(false);
    }
  };

  const handleCreateRebusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!rebusAnswer.trim() && !rebusImage) {
      alert('Please provide either an answer/clue or upload an image');
      return;
    }

    setSubmittingRebus(true);
    try {
      const username = getUsername();
      let imageUrl: string | null = null;

      // Upload image if provided
      if (rebusImage) {
        const timestamp = Date.now();
        const fileExt = rebusImage.name.split('.').pop()?.toLowerCase();
        
        // Check if file is JPG (policy only allows JPG)
        if (fileExt !== 'jpg' && fileExt !== 'jpeg') {
          alert('Only JPG/JPEG images are allowed. Please convert your image to JPG format.');
          setSubmittingRebus(false);
          return;
        }
        
        // Upload to public folder (required by policy)
        const fileName = `public/rebus-submission-${timestamp}.jpg`;

        console.log('Attempting to upload image:', {
          fileName,
          fileSize: rebusImage.size,
          fileType: rebusImage.type,
          bucket: 'Image Upload',
          path: fileName
        });

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('Image Upload')
          .upload(fileName, rebusImage, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error details:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError
          });
          
          alert(`Failed to upload image: ${uploadError.message || 'Unknown error'}. Please check the console for details and try again.`);
          setSubmittingRebus(false);
          return;
        }

        if (!uploadData) {
          console.error('Upload succeeded but no data returned');
          alert('Image upload completed but no data was returned. Please try again.');
          setSubmittingRebus(false);
          return;
        }

        console.log('Image uploaded successfully:', uploadData);
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('Image Upload')
          .getPublicUrl(fileName);

        if (!urlData || !urlData.publicUrl) {
          console.error('Failed to get public URL for uploaded image');
          alert('Image uploaded but failed to get public URL. Please try again.');
          setSubmittingRebus(false);
          return;
        }

        imageUrl = urlData.publicUrl;
        console.log('Image URL:', imageUrl);
      }

      // Save to image_submissions table
      const submissionData = {
        username: username || null,
        image_url: imageUrl,
        answer: rebusAnswer.trim() || null,
      };
      
      console.log('Saving to database:', submissionData);
      
      const { data: insertData, error: dbError } = await supabase
        .from('image_submissions')
        .insert(submissionData)
        .select();

      if (dbError) {
        console.error('Database error details:', {
          message: dbError.message,
          details: dbError.details,
          hint: dbError.hint,
          code: dbError.code,
          error: dbError
        });
        alert(`Failed to save rebus submission: ${dbError.message || 'Unknown error'}. Please check the console for details.`);
        return;
      }

      console.log('Successfully saved to database:', insertData);

      setRebusSubmitted(true);
      setRebusImage(null);
      setRebusAnswer('');
      setShowCreateRebus(false);
      alert('Thank you for your rebus submission!');
    } catch (error) {
      console.error('Error submitting rebus:', error);
      alert('Failed to submit rebus. Please try again.');
    } finally {
      setSubmittingRebus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading archive...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Puzzle Archive
      </h1>

      {/* Info Note */}
      <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4 md:mb-6">
        <p className="text-xs sm:text-sm text-blue-800 font-semibold text-center">
          📊 Archive puzzles contribute to your all-time leaderboard
        </p>
      </div>

      {/* Difficulty Legend */}
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-3 sm:mb-4 md:mb-6">
        <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 text-center">
          Difficulty Scale (based on % correct)
        </div>
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: getDifficultyColor(0) }}></div>
            <span className="text-[10px] sm:text-xs text-gray-700 font-semibold">Hardest</span>
          </div>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ 
            background: 'linear-gradient(to right, rgb(220, 38, 38), rgb(249, 140, 20), rgb(34, 197, 94))' 
          }}></div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: getDifficultyColor(100) }}></div>
            <span className="text-[10px] sm:text-xs text-gray-700 font-semibold">Easiest</span>
          </div>
        </div>
        <div className="text-[10px] sm:text-xs text-gray-600 text-center">
          <span className="font-semibold text-red-600">Red = Hardest</span> (low % correct) • <span className="font-semibold text-green-600">Green = Easiest</span> (high % correct)
        </div>
      </div>

      {puzzles.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No puzzles in the archive yet.</p>
        </div>
      ) : (
        <>
          {/* Not Played Puzzles */}
          {(() => {
            const notPlayed = puzzles.filter(p => !playedPuzzleIds.has(p.id));
            const played = puzzles.filter(p => playedPuzzleIds.has(p.id));
            
            return (
              <>
                {notPlayed.length > 0 && (
                  <div className="mb-6 sm:mb-8">
                    <div className="mb-3 sm:mb-4 flex justify-center">
                      <button
                        onClick={() => setShowCreateRebus(true)}
                        className="inline-flex items-center gap-2 bg-purple-600 text-white py-2 px-4 sm:px-6 rounded-md hover:bg-purple-700 font-medium text-xs sm:text-sm md:text-base"
                      >
                        <span>✨</span> <span>Create your own rebus</span>
                      </button>
                    </div>
                    <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                      Not Played
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {notPlayed.map((puzzle) => {
                        // Parse date string directly to avoid timezone issues
                        const dateParts = puzzle.date.split('T')[0].split('-');
                        const year = parseInt(dateParts[0]);
                        const month = parseInt(dateParts[1]) - 1; // 0-indexed
                        const day = parseInt(dateParts[2]);
                        const puzzleDate = new Date(year, month, day);
                        const dateStr = puzzleDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        });

                        // Check if this is a Julia puzzle (vegemite, adventure, rugby)
                        const isJuliaPuzzle = ['vegemite', 'adventure', 'rugby'].includes(puzzle.answer.toLowerCase());
                        const isPaused = pausedPuzzleIds.has(puzzle.id);
                        
                        // Create border color based on success rate (difficulty)
                        // Low success rate = red (hard), medium = orange, high = green (easy)
                        const difficultyColor = isJuliaPuzzle 
                          ? 'rgb(147, 51, 234)' // purple for Julia puzzles
                          : getDifficultyColor(puzzle.successRate);
                        
                        // Use the difficulty color as a solid border (gradient with same color)
                        const gradientBorder = `linear-gradient(to right, ${difficultyColor}, ${difficultyColor})`;

                        return (
                          <Link
                            key={puzzle.id}
                            to={`/archive/${puzzle.id}`}
                            className="rounded-lg shadow-md transition-all relative hover:shadow-lg"
                            style={{
                              background: gradientBorder,
                              padding: '2px',
                            }}
                          >
                            <div className="bg-white rounded-lg h-full p-3 sm:p-4 relative">
                              <div className="absolute top-1 right-1 sm:top-2 sm:right-2 flex flex-col gap-1">
                                {isPaused && (
                                  <span className="text-[9px] sm:text-[10px] font-semibold text-orange-700 bg-orange-200 px-1.5 sm:px-2 py-0.5 rounded">
                                    ⏸️ Paused
                                  </span>
                                )}
                                {isJuliaPuzzle && (
                                  <span className="text-[9px] sm:text-[10px] font-semibold text-purple-700 bg-purple-200 px-1.5 sm:px-2 py-0.5 rounded">
                                    julia
                                  </span>
                                )}
                              </div>
                              <div className="text-center">
                                <div className="text-sm sm:text-base font-semibold mb-2 text-gray-900">
                                  {dateStr}
                                </div>
                                <div className="space-y-0.5 mb-1">
                                  <div className="text-sm sm:text-base font-medium text-blue-600">
                                    {puzzle.totalPlayers} {puzzle.totalPlayers === 1 ? 'play' : 'plays'} • {puzzle.successRate !== null ? `${puzzle.successRate.toFixed(1)}% correct` : '—'}
                                  </div>
                                  {puzzle.averageGuesses !== null && (
                                    <div className="text-[10px] sm:text-xs font-medium text-gray-600">
                                      Avg {puzzle.averageGuesses.toFixed(1)} guesses
                                    </div>
                                  )}
                                  {puzzle.averageTime !== null && (
                                    <div className="text-[10px] sm:text-xs font-medium text-gray-600">
                                      Avg {(puzzle.averageTime / 1000).toFixed(2)}s
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Played Puzzles */}
                {played.length > 0 && (
                  <div className="mb-6 sm:mb-8">
                    <button
                      onClick={() => setShowPlayed(!showPlayed)}
                      className="flex items-center justify-between w-full text-left mb-3 sm:mb-4"
                    >
                      <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                        Played ({played.length})
                      </h2>
                      <span className={`text-lg sm:text-xl transition-transform duration-200 ${showPlayed ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {showPlayed && (
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {played.map((puzzle) => {
                          // Parse date string directly to avoid timezone issues
                          const dateParts = puzzle.date.split('T')[0].split('-');
                          const year = parseInt(dateParts[0]);
                          const month = parseInt(dateParts[1]) - 1; // 0-indexed
                          const day = parseInt(dateParts[2]);
                          const puzzleDate = new Date(year, month, day);
                          const dateStr = puzzleDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          });

                          const isPlayed = playedPuzzleIds.has(puzzle.id);
                          const playedInfo = playedPuzzleData.get(puzzle.id);
                          const isPaused = pausedPuzzleIds.has(puzzle.id);

                          // Check if this is a Julia puzzle (vegemite, adventure, rugby)
                          const isJuliaPuzzle = ['vegemite', 'adventure', 'rugby'].includes(puzzle.answer.toLowerCase());
                          
                          // Create border color based on success rate (difficulty)
                          // Low success rate = red (hard), medium = orange, high = green (easy)
                          const difficultyColor = isJuliaPuzzle 
                            ? 'rgb(147, 51, 234)' // purple for Julia puzzles
                            : getDifficultyColor(puzzle.successRate);
                          
                          // Use the difficulty color as a solid border (gradient with same color)
                          const gradientBorder = `linear-gradient(to right, ${difficultyColor}, ${difficultyColor})`;

                          return (
                            <Link
                              key={puzzle.id}
                              to={`/archive/${puzzle.id}`}
                              className={`rounded-lg shadow-md transition-all relative ${
                                isPlayed ? 'opacity-90' : 'hover:shadow-lg'
                              }`}
                              style={{
                                background: gradientBorder,
                                padding: '2px',
                              }}
                            >
                              <div className="bg-white rounded-lg h-full p-3 sm:p-4 relative">
                                <div className="absolute top-1 right-1 sm:top-2 sm:right-2 flex flex-col gap-1">
                                  {isPaused && (
                                    <span className="text-[9px] sm:text-[10px] font-semibold text-orange-700 bg-orange-200 px-1.5 sm:px-2 py-0.5 rounded">
                                      ⏸️ Paused
                                    </span>
                                  )}
                                  {isPlayed && (
                                    <span className="text-[9px] sm:text-[10px] font-semibold text-gray-600 bg-gray-200 px-1.5 sm:px-2 py-0.5 rounded">
                                      Already played
                                    </span>
                                  )}
                                  {isJuliaPuzzle && (
                                    <span className="text-[9px] sm:text-[10px] font-semibold text-purple-700 bg-purple-200 px-1.5 sm:px-2 py-0.5 rounded">
                                      julia
                                    </span>
                                  )}
                                </div>
                                <div className="text-center">
                                  <div className={`text-sm sm:text-base font-semibold mb-2 ${isPlayed ? 'text-gray-600' : 'text-gray-900'}`}>
                                    {dateStr}
                                  </div>
                                  <div className="space-y-0.5 mb-1">
                                    <div className={`text-sm sm:text-base font-medium ${isPlayed ? 'text-blue-500' : 'text-blue-600'}`}>
                                      {puzzle.totalPlayers} {puzzle.totalPlayers === 1 ? 'play' : 'plays'} • {puzzle.successRate !== null ? `${puzzle.successRate.toFixed(1)}% correct` : '—'}
                                    </div>
                                    {puzzle.averageGuesses !== null && (
                                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-600'}`}>
                                        Avg {puzzle.averageGuesses.toFixed(1)} guesses
                                      </div>
                                    )}
                                    {puzzle.averageTime !== null && (
                                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-600'}`}>
                                        Avg {(puzzle.averageTime / 1000).toFixed(2)}s
                                      </div>
                                    )}
                                  </div>
                                  {isPlayed && playedInfo && (
                                    <div className="text-[10px] sm:text-xs font-medium text-gray-600 mt-1 pt-1 border-t border-gray-200">
                                      <div>You: {playedInfo.guess_count !== null ? `${playedInfo.guess_count} guesses` : '—'} • {(playedInfo.time_ms / 1000).toFixed(2)}s</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Submit Puzzle Button - Hidden for now */}
      {false && (
        <div className="mt-8 mb-4 text-center">
          <button
            onClick={() => setShowSubmitModal(true)}
            className="bg-purple-600 text-white py-2 sm:py-3 px-6 sm:px-8 rounded-lg hover:bg-purple-700 font-medium text-sm sm:text-base shadow-md"
          >
            📝 Submit a Puzzle
          </button>
        </div>
      )}

      {/* Submit Puzzle Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowSubmitModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Submit a Puzzle</h2>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <form onSubmit={handlePuzzleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="puzzle-answer" className="block text-sm font-medium text-gray-700 mb-2">
                  Puzzle Answer (optional)
                </label>
                <input
                  type="text"
                  id="puzzle-answer"
                  value={puzzleAnswer}
                  onChange={(e) => setPuzzleAnswer(e.target.value)}
                  placeholder="Enter the puzzle answer..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="puzzle-image" className="block text-sm font-medium text-gray-700 mb-2">
                  Puzzle Image (required)
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      id="puzzle-image"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 10 * 1024 * 1024) {
                            alert('Image must be less than 10MB');
                            return;
                          }
                          setPuzzleImage(file);
                        }
                      }}
                      className="hidden"
                    />
                    <div className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-center">
                      {puzzleImage ? `📷 ${puzzleImage.name}` : '📷 Choose Image'}
                    </div>
                  </label>
                  {puzzleImage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPuzzleImage(null);
                      }}
                      className="px-3 py-2 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {puzzleImage && (
                  <div className="mt-2">
                    <img
                      src={URL.createObjectURL(puzzleImage)}
                      alt="Preview"
                      className="max-w-full max-h-48 rounded-md border border-gray-300"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSubmitModal(false);
                    setPuzzleAnswer('');
                    setPuzzleImage(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPuzzle || !puzzleImage}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                >
                  {submittingPuzzle ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Your Own Rebus Modal */}
      {showCreateRebus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateRebus(false)}>
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreateRebus(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
            <div className="pr-8">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                Create Your Own Rebus
              </h3>
              {!rebusSubmitted ? (
                <form onSubmit={handleCreateRebusSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="rebusAnswer"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Answer or Clue (optional if uploading image)
                    </label>
                    <input
                      type="text"
                      id="rebusAnswer"
                      value={rebusAnswer}
                      onChange={(e) => setRebusAnswer(e.target.value)}
                      placeholder="Enter the answer or clue..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Image (optional)
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">JPG/JPEG only (MAX. 10MB)</p>
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setRebusImage(file);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {rebusImage && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-gray-600">{rebusImage.name}</span>
                        <button
                          type="button"
                          onClick={() => setRebusImage(null)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submittingRebus || (!rebusAnswer.trim() && !rebusImage)}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    {submittingRebus ? 'Submitting...' : 'Submit Rebus'}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-green-600 font-medium">
                  Thank you for your rebus submission!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Archive;

