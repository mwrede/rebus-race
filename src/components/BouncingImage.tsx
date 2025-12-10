import { useEffect, useRef, useState } from 'react';

interface BouncingImageProps {
  src: string;
  alt: string;
  className?: string;
}

function BouncingImage({ src, alt, className = '' }: BouncingImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!imageRef.current || !containerRef.current) return;

    const image = imageRef.current;
    const container = containerRef.current;
    
    // Wait for image to load
    const handleImageLoad = () => {
      const containerRect = container.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const imageWidth = imageRect.width;
      const imageHeight = imageRect.height;

      // Start position in center
      let x = (containerRect.width - imageWidth) / 2;
      let y = (containerRect.height - imageHeight) / 2;
      
      // Random initial velocity (2-4 pixels per frame)
      let vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
      let vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);

      const animate = () => {
        // Update position
        x += vx;
        y += vy;

        // Get current container dimensions
        const currentContainerRect = container.getBoundingClientRect();
        const containerWidth = currentContainerRect.width;
        const containerHeight = currentContainerRect.height;

        // Bounce off walls
        if (x <= 0) {
          vx = Math.abs(vx);
          x = 0;
        } else if (x + imageWidth >= containerWidth) {
          vx = -Math.abs(vx);
          x = containerWidth - imageWidth;
        }

        if (y <= 0) {
          vy = Math.abs(vy);
          y = 0;
        } else if (y + imageHeight >= containerHeight) {
          vy = -Math.abs(vy);
          y = containerHeight - imageHeight;
        }

        setPosition({ x, y });
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (image.complete) {
      handleImageLoad();
    } else {
      image.addEventListener('load', handleImageLoad);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      image.removeEventListener('load', handleImageLoad);
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[30vh] sm:h-[40vh] overflow-hidden"
      style={{ minHeight: '200px' }}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={`absolute ${className}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

export default BouncingImage;

