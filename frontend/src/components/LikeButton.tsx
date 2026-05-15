"use client";

import { useCallback, useEffect, useState } from "react";
import { toggleLike } from "@/lib/posts";
import { getFingerprint } from "@/lib/fingerprint";
import styles from "./LikeButton.module.css";

type Props = {
  postId: number;
  initialCount: number;
  initialLiked: boolean;
};

export function LikeButton({ postId, initialCount, initialLiked }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  const handleClick = useCallback(async () => {
    if (pending) return;
    setPending(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((prev) => (wasLiked ? prev - 1 : prev + 1));
    try {
      const res = await toggleLike(postId, getFingerprint());
      setLiked(res.liked);
      setCount(res.like_count);
    } catch {
      setLiked(wasLiked);
      setCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      setPending(false);
    }
  }, [postId, pending, liked]);

  return (
    <button
      className={`${styles.btn} ${liked ? styles.liked : ""}`}
      onClick={handleClick}
      disabled={pending}
      aria-label={liked ? "取消点赞" : "点赞"}
    >
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
