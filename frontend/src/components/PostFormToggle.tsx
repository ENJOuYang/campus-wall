"use client";

import { PostForm } from "./PostForm";
import { usePostFormVisible, hidePostForm } from "@/lib/post-form-toggle";
import { useEffect, useRef } from "react";

export function PostFormToggle() {
  const visible = usePostFormVisible();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div ref={ref}>
      <PostForm />
    </div>
  );
}
