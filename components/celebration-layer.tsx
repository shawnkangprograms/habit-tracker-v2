import {useCallback, useEffect} from 'react';
import {tickLog} from '@/hooks/use-celebrations';
import {CelebrationOverlay} from '@/components/celebration-overlay';
import {PerfectDayBanner} from '@/components/perfect-day-banner';
import {EncouragementToast} from '@/components/encouragement-toast';
import type {QueueItem} from '@/utils/celebrations';

// Renders the one queue item that is showing (from hooks/use-celebrations.ts), or nothing.
// Keyed by item id, so each item mounts fresh with its own timer and haptic.
export function CelebrationLayer({item, reduceMotion, onDismiss}: {
  item: QueueItem | null;
  reduceMotion: boolean;
  onDismiss: (id: number) => void;
}) {
  if (!item) return null;
  return <CurrentItem key={item.id} item={item} reduceMotion={reduceMotion} onDismiss={onDismiss} />;
}

function CurrentItem({item, reduceMotion, onDismiss}: {
  item: QueueItem;
  reduceMotion: boolean;
  onDismiss: (id: number) => void;
}) {
  const dismiss = useCallback(() => onDismiss(item.id), [onDismiss, item.id]);

  // dev timing: from the tap to this toast mounting
  const tappedAt = item.kind === 'toast' ? item.tappedAt : undefined;
  useEffect(() => {
    if (tappedAt !== undefined) tickLog(`toast shown in ${Date.now() - tappedAt} ms`);
  }, [tappedAt]);

  if (item.kind === 'toast') return <EncouragementToast text={item.text} onDismiss={dismiss} />;
  if (item.kind === 'perfectDay') return <PerfectDayBanner text={item.text} onDismiss={dismiss} />;
  return <CelebrationOverlay item={item} reduceMotion={reduceMotion} onContinue={dismiss} />;
}
