"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      richColors
      position="bottom-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-bg-surface group-[.toaster]:text-text-primary group-[.toaster]:border-bg-elevated group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-text-muted",
          actionButton:
            "group-[.toast]:bg-gold-primary group-[.toast]:text-bg-darkest",
          cancelButton:
            "group-[.toast]:bg-bg-elevated group-[.toast]:text-text-muted",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
