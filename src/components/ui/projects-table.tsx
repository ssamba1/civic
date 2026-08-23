'use client';

import * as React from 'react';
import { useId, useState } from 'react';
import { format } from 'date-fns';
import {
   Calendar as CalendarIcon,
   CheckIcon,
   CircleCheck,
   CircleX,
   AlertCircle,
   HelpCircle,
   Bell,
   LucideIcon,
   ChevronLeft,
   ChevronRight,
   XIcon,
   SearchIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { RemixiconComponentType } from '@remixicon/react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { DayPicker } from 'react-day-picker';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

function cn(...inputs: ClassValue[]) {
   return twMerge(clsx(inputs));
}

const buttonVariants = cva(
   "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
   {
      variants: {
         variant: {
            default:
               'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
            destructive:
               'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
            outline:
               'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
            secondary:
               'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
            ghost: 'hover:bg-accent hover:text-accent-foreground',
            link: 'text-primary underline-offset-4 hover:underline',
         },
         size: {
            default: 'h-9 px-4 py-2 has-[>svg]:px-3',
            xxs: 'h-6 rounded-md gap-1.5 px-2.5 has-[>svg]:px-2',
            xs: 'h-7 rounded-md gap-1.5 px-2.5 has-[>svg]:px-2',
            sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
            lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
            icon: 'size-9',
         },
      },
      defaultVariants: {
         variant: 'default',
         size: 'default',
      },
   },
);

function Button({
   className,
   variant,
   size,
   asChild = false,
   ...props
}: React.ComponentProps<'button'> &
   VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
   }) {
   const Comp = asChild ? Slot : 'button';

   return (
      <Comp
         data-slot="button"
         className={cn(buttonVariants({ variant, size, className }))}
         {...props}
      />
   );
}

function Calendar({
   className,
   classNames,
   showOutsideDays = true,
   ...props
}: React.ComponentProps<typeof DayPicker>) {
   return (
      <DayPicker
         showOutsideDays={showOutsideDays}
         className={cn('p-3', className)}
         classNames={{
            months: 'flex flex-col sm:flex-row gap-2',
            month: 'flex flex-col gap-4',
            caption: 'flex justify-center pt-1 relative items-center w-full',
            caption_label: 'text-sm font-medium',
            nav: 'flex items-center gap-1',
            nav_button: cn(
               buttonVariants({ variant: 'outline' }),
               'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
            ),
            nav_button_previous: 'absolute left-1',
            nav_button_next: 'absolute right-1',
            table: 'w-full border-collapse space-x-1',
            head_row: 'flex',
            head_cell:
               'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
            row: 'flex w-full mt-2',
            cell: cn(
               'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md',
               props.mode === 'range'
                  ? '[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md'
                  : '[&:has([aria-selected])]:rounded-md',
            ),
            day: cn(
               buttonVariants({ variant: 'ghost' }),
               'size-8 p-0 font-normal aria-selected:opacity-100',
            ),
            day_range_start:
               'day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground',
            day_range_end:
               'day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground',
            day_selected:
               'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
            day_today: 'bg-accent text-accent-foreground',
            day_outside:
               'day-outside text-muted-foreground aria-selected:text-muted-foreground',
            day_disabled: 'text-muted-foreground opacity-50',
            day_range_middle:
               'aria-selected:bg-accent aria-selected:text-accent-foreground',
            day_hidden: 'invisible',
            ...classNames,
         }}
         components={{
            IconLeft: ({ className, ...props }) => (
               <ChevronLeft className={cn('size-4', className)} {...props} />
            ),
            IconRight: ({ className, ...props }) => (
               <ChevronRight className={cn('size-4', className)} {...props} />
            ),
         }}
         {...props}
      />
   );
}

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
   return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
   ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
   return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
   className,
   align = 'center',
   sideOffset = 4,
   ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
   return (
      <PopoverPrimitive.Portal>
         <PopoverPrimitive.Content
            data-slot="popover-content"
            align={align}
            sideOffset={sideOffset}
            className={cn(
               'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 rounded-md border p-4 shadow-md outline-hidden',
               className,
            )}
            {...props}
         />
      </PopoverPrimitive.Portal>
   );
}

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
   return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
   ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
   return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
   ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
   return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogContent({
   className,
   children,
   ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
   return (
      <DialogPortal data-slot="dialog-portal">
         <DialogPrimitive.Overlay
            data-slot="dialog-overlay"
            className={cn(
               'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
               className,
            )}
         />
         <DialogPrimitive.Content
            data-slot="dialog-content"
            className={cn(
               'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
               className,
            )}
            {...props}
         >
            {children}
            <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
               <XIcon />
               <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
         </DialogPrimitive.Content>
      </DialogPortal>
   );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
   return (
      <div
         data-slot="dialog-header"
         className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
         {...props}
      />
   );
}

function DialogTitle({
   className,
   ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
   return (
      <DialogPrimitive.Title
         data-slot="dialog-title"
         className={cn('text-lg leading-none font-semibold', className)}
         {...props}
      />
   );
}

function DialogDescription({
   className,
   ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
   return (
      <DialogPrimitive.Description
         data-slot="dialog-description"
         className={cn('text-muted-foreground text-sm', className)}
         {...props}
      />
   );
}

function Command({
   className,
   ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
   return (
      <CommandPrimitive
         data-slot="command"
         className={cn(
            'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md',
            className,
         )}
         {...props}
      />
   );
}

function CommandInput({
   className,
   ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
   return (
      <div
         data-slot="command-input-wrapper"
         className="flex h-9 items-center gap-2 border-b px-3"
      >
         <SearchIcon className="size-4 shrink-0 opacity-50" />
         <CommandPrimitive.Input
            data-slot="command-input"
            className={cn(
               'placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
               className,
            )}
            {...props}
         />
      </div>
   );
}

function CommandList({
   className,
   ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
   return (
      <CommandPrimitive.List
         data-slot="command-list"
         className={cn(
            'max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto',
            className,
         )}
         {...props}
      />
   );
}

function CommandEmpty({
   ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
   return (
      <CommandPrimitive.Empty
         data-slot="command-empty"
         className="py-6 text-center text-sm"
         {...props}
      />
   );
}

function CommandGroup({
   className,
   ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
   return (
      <CommandPrimitive.Group
         data-slot="command-group"
         className={cn(
            'text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
            className,
         )}
         {...props}
      />
   );
}

function CommandItem({
   className,
   ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
   return (
      <CommandPrimitive.Item
         data-slot="command-item"
         className={cn(
            "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            className,
         )}
         {...props}
      />
   );
}

function Avatar({
   className,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
   return (
      <AvatarPrimitive.Root
         data-slot="avatar"
         className={cn(
            'relative flex size-8 shrink-0 overflow-hidden rounded-full',
            className,
         )}
         {...props}
      />
   );
}

function AvatarImage({
   className,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
   return (
      <AvatarPrimitive.Image
         data-slot="avatar-image"
         className={cn('aspect-square size-full', className)}
         {...props}
      />
   );
}

function AvatarFallback({
   className,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
   return (
      <AvatarPrimitive.Fallback
         data-slot="avatar-fallback"
         className={cn(
            'bg-muted flex size-full items-center justify-center rounded-full',
            className,
         )}
         {...props}
      />
   );
}

const MOBILE_BREAKPOINT = 1024;

function useIsMobile() {
   const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
      undefined,
   );

   React.useEffect(() => {
      const mql = window.matchMedia(
         `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
      );
      const onChange = () => {
         setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      };
      mql.addEventListener('change', onChange);
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      return () => mql.removeEventListener('change', onChange);
   }, []);

   return !!isMobile;
}

interface Status {
   id: string;
   name: string;
   color: string;
   icon: React.FC;
}

const BacklogIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#bec2c8"
         strokeWidth="2"
         strokeDasharray="1.4 1.74"
         strokeDashoffset="0.65"
      ></circle>
      <circle
         className="progress"
         cx="7"
         cy="7"
         r="2"
         fill="none"
         stroke="#bec2c8"
         strokeWidth="4"
         strokeDasharray="0 100"
         strokeDashoffset="0"
         transform="rotate(-90 7 7)"
      ></circle>
   </svg>
);

const PausedIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#0ea5e9"
         strokeWidth="2"
         strokeDasharray="3.14 0"
         strokeDashoffset="-0.7"
      ></circle>
      <circle
         className="progress"
         cx="7"
         cy="7"
         r="2"
         fill="none"
         stroke="#0ea5e9"
         strokeWidth="4"
         strokeDasharray="6.2517693806436885 100"
         strokeDashoffset="0"
         transform="rotate(-90 7 7)"
      ></circle>
   </svg>
);

const ToDoIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#e2e2e2"
         strokeWidth="2"
         strokeDasharray="3.14 0"
         strokeDashoffset="-0.7"
      ></circle>
      <circle
         className="progress"
         cx="7"
         cy="7"
         r="2"
         fill="none"
         stroke="#e2e2e2"
         strokeWidth="4"
         strokeDasharray="0 100"
         strokeDashoffset="0"
         transform="rotate(-90 7 7)"
      ></circle>
   </svg>
);

const InProgressIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#facc15"
         strokeWidth="2"
         strokeDasharray="3.14 0"
         strokeDashoffset="-0.7"
      ></circle>
      <circle
         className="progress"
         cx="7"
         cy="7"
         r="2"
         fill="none"
         stroke="#facc15"
         strokeWidth="4"
         strokeDasharray="2.0839231268812295 100"
         strokeDashoffset="0"
         transform="rotate(-90 7 7)"
      ></circle>
   </svg>
);

const TechnicalReviewIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#22c55e"
         strokeWidth="2"
         strokeDasharray="3.14 0"
         strokeDashoffset="-0.7"
      ></circle>
      <circle
         className="progress"
         cx="7"
         cy="7"
         r="2"
         fill="none"
         stroke="#22c55e"
         strokeWidth="4"
         strokeDasharray="4.167846253762459 100"
         strokeDashoffset="0"
         transform="rotate(-90 7 7)"
      ></circle>
   </svg>
);

const CompletedIcon: React.FC = () => (
   <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle
         cx="7"
         cy="7"
         r="6"
         fill="none"
         stroke="#8b5cf6"
         strokeWidth="2"
         strokeDasharray="3.14 0"
         strokeDashoffset="-0.7"
      ></circle>
      <path
         d="M4.5 7L6.5 9L9.5 5"
         stroke="#8b5cf6"
         strokeWidth="1.5"
         strokeLinecap="round"
         strokeLinejoin="round"
      />
   </svg>
);

const statusData: Status[] = [
   {
      id: 'in-progress',
      name: 'In Progress',
      color: '#facc15',
      icon: InProgressIcon,
   },
   {
      id: 'technical-review',
      name: 'Technical Review',
      color: '#22c55e',
      icon: TechnicalReviewIcon,
   },
   { id: 'completed', name: 'Completed', color: '#8b5cf6', icon: CompletedIcon },
   { id: 'paused', name: 'Paused', color: '#0ea5e9', icon: PausedIcon },
   { id: 'to-do', name: 'Todo', color: '#f97316', icon: ToDoIcon },
   { id: 'backlog', name: 'Backlog', color: '#ec4899', icon: BacklogIcon },
];

interface IconProps extends React.SVGProps<SVGSVGElement> {
   className?: string;
}

const NoPriorityIcon = ({ className, ...props }: IconProps) => (
   <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-label="No Priority"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
   >
      <rect x="1.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9"></rect>
      <rect x="6.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9"></rect>
      <rect x="11.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9"></rect>
   </svg>
);

const UrgentPriorityIcon = ({ className, ...props }: IconProps) => (
   <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-label="Urgent Priority"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
   >
      <path d="M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4L9 4L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z"></path>
   </svg>
);

const HighPriorityIcon = ({ className, ...props }: IconProps) => (
   <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-label="High Priority"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
   >
      <rect x="1.5" y="8" width="3" height="6" rx="1"></rect>
      <rect x="6.5" y="5" width="3" height="9" rx="1"></rect>
      <rect x="11.5" y="2" width="3" height="12" rx="1"></rect>
   </svg>
);

const MediumPriorityIcon = ({ className, ...props }: IconProps) => (
   <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-label="Medium Priority"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
   >
      <rect x="1.5" y="8" width="3" height="6" rx="1"></rect>
      <rect x="6.5" y="5" width="3" height="9" rx="1"></rect>
      <rect
         x="11.5"
         y="2"
         width="3"
         height="12"
         rx="1"
         fillOpacity="0.4"
      ></rect>
   </svg>
);

const LowPriorityIcon = ({ className, ...props }: IconProps) => (
   <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-label="Low Priority"
      role="img"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
   >
      <rect x="1.5" y="8" width="3" height="6" rx="1"></rect>
      <rect x="6.5" y="5" width="3" height="9" rx="1" fillOpacity="0.4"></rect>
      <rect
         x="11.5"
         y="2"
         width="3"
         height="12"
         rx="1"
         fillOpacity="0.4"
      ></rect>
   </svg>
);

interface Priority {
   id: string;
   name: string;
   icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

const prioritiesData: Priority[] = [
   { id: 'no-priority', name: 'No priority', icon: NoPriorityIcon },
   { id: 'urgent', name: 'Urgent', icon: UrgentPriorityIcon },
   { id: 'high', name: 'High', icon: HighPriorityIcon },
   { id: 'medium', name: 'Medium', icon: MediumPriorityIcon },
   { id: 'low', name: 'Low', icon: LowPriorityIcon },
];

interface User {
   id: string;
   name: string;
   avatarUrl: string;
   email: string;
   status: 'online' | 'offline' | 'away';
   role: 'Member' | 'Admin' | 'Guest';
   joinedDate: string;
   teamIds: string[];
}

const avatarUrl = (seed: string) =>
   `https://api.dicebear.com/9.x/glass/svg?seed=${seed}`;

const usersData: User[] = [
   {
      id: 'ln',
      name: 'leonel.ngoya',
      avatarUrl: avatarUrl('ln'),
      email: 'leonelngoya@gmail.com',
      status: 'online',
      role: 'Admin',
      joinedDate: '2022-01-01',
      teamIds: ['CORE', 'PERF', 'DESIGN', 'WEB'],
   },
   {
      id: 'sophia',
      name: 'sophia.reed',
      avatarUrl: avatarUrl('sophiareed'),
      email: 'sophiareed@gmail.com',
      status: 'offline',
      role: 'Admin',
      joinedDate: '2023-06-04',
      teamIds: ['CORE', 'PERF'],
   },
   {
      id: 'mason',
      name: 'mason.carter',
      avatarUrl: avatarUrl('mason'),
      email: 'masoncarter@gmail.com',
      status: 'away',
      role: 'Member',
      joinedDate: '2023-11-01',
      teamIds: ['CORE', 'DESIGN'],
   },
   {
      id: 'emma',
      name: 'emma.jones',
      avatarUrl: avatarUrl('emmajones'),
      email: 'emmajones@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2023-03-20',
      teamIds: ['CORE'],
   },
   {
      id: 'alex',
      name: 'alex.zhang',
      avatarUrl: avatarUrl('alexzhang'),
      email: 'alexzhang@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2023-05-15',
      teamIds: ['DESIGN', 'PERF'],
   },
   {
      id: 'olivia',
      name: 'olivia.wilson',
      avatarUrl: avatarUrl('oliviawilson'),
      email: 'oliviawilson@gmail.com',
      status: 'offline',
      role: 'Admin',
      joinedDate: '2022-08-22',
      teamIds: ['PERF'],
   },
   {
      id: 'lucas',
      name: 'lucas.martin',
      avatarUrl: avatarUrl('lucasmartin'),
      email: 'lucasmartin@gmail.com',
      status: 'away',
      role: 'Member',
      joinedDate: '2023-02-14',
      teamIds: ['CORE', 'DESIGN', 'PERF'],
   },
   {
      id: 'isabella',
      name: 'isabella.garcia',
      avatarUrl: avatarUrl('isabellagarcia'),
      email: 'isabellagarcia@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2022-11-30',
      teamIds: ['DESIGN'],
   },
   {
      id: 'ethan',
      name: 'ethan.brown',
      avatarUrl: avatarUrl('ethanbrown'),
      email: 'ethanbrown@gmail.com',
      status: 'offline',
      role: 'Member',
      joinedDate: '2023-07-18',
      teamIds: ['PERF'],
   },
   {
      id: 'amelia',
      name: 'amelia.kim',
      avatarUrl: avatarUrl('ameliakim'),
      email: 'ameliakim@gmail.com',
      status: 'online',
      role: 'Guest',
      joinedDate: '2022-05-09',
      teamIds: ['DESIGN'],
   },
   {
      id: 'noah',
      name: 'noah.davis',
      avatarUrl: avatarUrl('noahdavis'),
      email: 'noahdavis@gmail.com',
      status: 'away',
      role: 'Member',
      joinedDate: '2023-09-27',
      teamIds: ['PERF', 'DESIGN'],
   },
   {
      id: 'charlotte',
      name: 'charlotte.miller',
      avatarUrl: avatarUrl('charlottemiller'),
      email: 'charlottemiller@gmail.com',
      status: 'online',
      role: 'Guest',
      joinedDate: '2022-04-03',
      teamIds: ['PERF'],
   },
   {
      id: 'aiden',
      name: 'aiden.thompson',
      avatarUrl: avatarUrl('aidenthompson'),
      email: 'aidenthompson@gmail.com',
      status: 'offline',
      role: 'Admin',
      joinedDate: '2023-01-12',
      teamIds: ['DESIGN'],
   },
   {
      id: 'mia',
      name: 'mia.patel',
      avatarUrl: avatarUrl('miapatel'),
      email: 'miapatel@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2022-10-05',
      teamIds: ['DESIGN', 'PERF'],
   },
   {
      id: 'logan',
      name: 'logan.wright',
      avatarUrl: avatarUrl('loganwright'),
      email: 'loganwright@gmail.com',
      status: 'away',
      role: 'Guest',
      joinedDate: '2023-08-14',
      teamIds: ['PERF', 'DESIGN'],
   },
   {
      id: 'harper',
      name: 'harper.robinson',
      avatarUrl: avatarUrl('harperrobinson'),
      email: 'harperrobinson@gmail.com',
      status: 'offline',
      role: 'Member',
      joinedDate: '2022-07-29',
      teamIds: ['PERF'],
   },
   {
      id: 'gabriel',
      name: 'gabriel.nguyen',
      avatarUrl: avatarUrl('gabrielnguyen'),
      email: 'gabrielnguyen@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2023-04-17',
      teamIds: ['DESIGN'],
   },
   {
      id: 'victoria',
      name: 'victoria.lee',
      avatarUrl: avatarUrl('victorialee'),
      email: 'victorialee@gmail.com',
      status: 'away',
      role: 'Guest',
      joinedDate: '2022-12-08',
      teamIds: ['DESIGN'],
   },
   {
      id: 'daniel',
      name: 'daniel.taylor',
      avatarUrl: avatarUrl('danieltaylor'),
      email: 'danieltaylor@gmail.com',
      status: 'offline',
      role: 'Member',
      joinedDate: '2023-10-21',
      teamIds: ['PERF'],
   },
   {
      id: 'abigail',
      name: 'abigail.moore',
      avatarUrl: avatarUrl('abigailmoore'),
      email: 'abigailmoore@gmail.com',
      status: 'online',
      role: 'Member',
      joinedDate: '2022-06-17',
      teamIds: ['DESIGN', 'PERF'],
   },
];

interface Project {
   id: string;
   name: string;
   status: Status;
   icon: LucideIcon | RemixiconComponentType;
   percentComplete: number;
   startDate: string;
   lead: User;
   priority: Priority;
   health: Health;
}

interface Health {
   id: 'no-update' | 'off-track' | 'on-track' | 'at-risk';
   name: string;
   color: string;
   description: string;
}

const healthData: Health[] = [
   {
      id: 'no-update',
      name: 'No Update',
      color: '#FF0000',
      description: 'The project has not been updated in the last 30 days.',
   },
   {
      id: 'off-track',
      name: 'Off Track',
      color: '#FF0000',
      description: 'The project is not on track and may be delayed.',
   },
   {
      id: 'on-track',
      name: 'On Track',
      color: '#00FF00',
      description: 'The project is on track and on schedule.',
   },
   {
      id: 'at-risk',
      name: 'At Risk',
      color: '#FF0000',
      description: 'The project is at risk and may be delayed.',
   },
];

const projectsData: Project[] = [
   {
      id: '1',
      name: 'LNDev UI - Core Components',
      status: statusData[0],
      icon: HelpCircle,
      percentComplete: 80,
      startDate: '2025-03-08',
      lead: usersData[2],
      priority: prioritiesData[1],
      health: healthData[0],
   },
   {
      id: '2',
      name: 'LNDev UI - Theming',
      status: statusData[1],
      icon: HelpCircle,
      percentComplete: 50,
      startDate: '2025-03-14',
      lead: usersData[0],
      priority: prioritiesData[0],
      health: healthData[3],
   },
   {
      id: '3',
      name: 'LNDev UI - Modals',
      status: statusData[2],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-09',
      lead: usersData[1],
      priority: prioritiesData[2],
      health: healthData[1],
   },
   {
      id: '4',
      name: 'LNDev UI - Navigation',
      status: statusData[3],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-10',
      lead: usersData[2],
      priority: prioritiesData[0],
      health: healthData[2],
   },
   {
      id: '5',
      name: 'LNDev UI - Layout',
      status: statusData[4],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-11',
      lead: usersData[0],
      priority: prioritiesData[0],
      health: healthData[3],
   },
   {
      id: '6',
      name: 'LNDev UI - Sidebar',
      status: statusData[5],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-12',
      lead: usersData[1],
      priority: prioritiesData[0],
      health: healthData[1],
   },
   {
      id: '7',
      name: 'LNDev UI - Cards',
      status: statusData[1],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-13',
      lead: usersData[2],
      priority: prioritiesData[0],
      health: healthData[2],
   },
   {
      id: '8',
      name: 'LNDev UI - Tooltip',
      status: statusData[2],
      icon: HelpCircle,
      percentComplete: 0,
      startDate: '2025-03-14',
      lead: usersData[0],
      priority: prioritiesData[0],
      health: healthData[3],
   },
   {
      id: '9',
      name: 'LNDev UI - Dropdown',
      status: statusData[3],
      icon: HelpCircle,
      percentComplete: 50,
      startDate: '2025-03-15',
      lead: usersData[1],
      priority: prioritiesData[0],
      health: healthData[3],
   },
   {
      id: '10',
      name: 'LNDev UI - Data Tables',
      status: statusData[0],
      icon: HelpCircle,
      percentComplete: 65,
      startDate: '2025-03-18',
      lead: usersData[2],
      priority: prioritiesData[1],
      health: healthData[0],
   },
   {
      id: '11',
      name: 'LNDev UI - Form Controls',
      status: statusData[2],
      icon: HelpCircle,
      percentComplete: 30,
      startDate: '2025-03-19',
      lead: usersData[0],
      priority: prioritiesData[1],
      health: healthData[2],
   },
   {
      id: '12',
      name: 'LNDev UI - Notifications',
      status: statusData[1],
      icon: HelpCircle,
      percentComplete: 45,
      startDate: '2025-03-20',
      lead: usersData[1],
      priority: prioritiesData[0],
      health: healthData[1],
   },
   {
      id: '13',
      name: 'LNDev UI - Authentication Flow',
      status: statusData[0],
      icon: HelpCircle,
      percentComplete: 75,
      startDate: '2025-03-05',
      lead: usersData[2],
      priority: prioritiesData[0],
      health: healthData[0],
   },
   {
      id: '14',
      name: 'LNDev UI - User Preferences',
      status: statusData[3],
      icon: HelpCircle,
      percentComplete: 10,
      startDate: '2025-03-22',
      lead: usersData[0],
      priority: prioritiesData[2],
      health: healthData[2],
   },
   {
      id: '15',
      name: 'LNDev UI - Dashboard Widgets',
      status: statusData[1],
      icon: HelpCircle,
      percentComplete: 55,
      startDate: '2025-03-17',
      lead: usersData[1],
      priority: prioritiesData[1],
      health: healthData[0],
   },
];

interface DatePickerComponentProps {
   date: Date | undefined;
   onDateChange?: (date: Date | undefined) => void;
}

function DatePickerComponent({ date, onDateChange }: DatePickerComponentProps) {
   const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
      date,
   );
   const [open, setOpen] = React.useState<boolean>(false);

   const handleDateSelect = (date: Date | undefined) => {
      setSelectedDate(date);
      if (onDateChange) {
         onDateChange(date);
      }
      setOpen(false);
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               className="h-7 px-2 justify-start text-left font-normal"
               size="sm"
            >
               <CalendarIcon className="h-4 w-4 md:mr-0.5" />
               {selectedDate ? (
                  <span className="text-xs hidden xl:inline mt-[1px]">
                     {format(selectedDate, 'MMM dd, yyyy')}
                  </span>
               ) : (
                  <span className="text-xs text-muted-foreground hidden xl:inline mt-[1px]">
                     No date
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
            <Calendar
               mode="single"
               selected={selectedDate}
               onSelect={handleDateSelect}
               initialFocus
            />
         </PopoverContent>
      </Popover>
   );
}

interface StatusWithPercentComponentProps {
   status: Status;
   percentComplete: number;
   onStatusChange?: (statusId: string) => void;
}

function StatusWithPercentComponent({
   status,
   percentComplete,
   onStatusChange,
}: StatusWithPercentComponentProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(status.id);

   const handleStatusChange = (statusId: string) => {
      setValue(statusId);
      setOpen(false);

      if (onStatusChange) {
         onStatusChange(statusId);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               id={id}
               className="flex items-center justify-center gap-1.5"
               size="sm"
               variant="ghost"
               role="combobox"
               aria-expanded={open}
            >
               {(() => {
                  const selectedItem = statusData.find((item) => item.id === value);
                  if (selectedItem) {
                     const Icon = selectedItem.icon;
                     return <Icon />;
                  }
                  return null;
               })()}
               <span className="text-xs font-medium mt-[1px]">
                  {percentComplete}%
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent className="border-input w-48 p-0" align="start">
            <Command>
               <CommandInput placeholder="Set status..." />
               <CommandList>
                  <CommandEmpty>No status found.</CommandEmpty>
                  <CommandGroup>
                     {statusData.map((item) => {
                        const Icon = item.icon;
                        return (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handleStatusChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Icon />
                                 <span className="text-xs">{item.name}</span>
                              </div>
                              {value === item.id && (
                                 <CheckIcon size={14} className="ml-auto" />
                              )}
                           </CommandItem>
                        );
                     })}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

interface LeadSelectorComponentProps {
   lead: User;
   onLeadChange?: (userId: string) => void;
}

function LeadSelectorComponent({
   lead,
   onLeadChange,
}: LeadSelectorComponentProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(lead.id);

   const handleLeadChange = (userId: string) => {
      setValue(userId);
      setOpen(false);

      if (onLeadChange) {
         onLeadChange(userId);
      }
   };

   return (
      <div>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center gap-1 h-7 px-2"
                  size="sm"
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
               >
                  {(() => {
                     const selectedUser = usersData.find(
                        (user) => user.id === value,
                     );
                     if (selectedUser) {
                        return (
                           <>
                              <Avatar className="size-5 mr-1">
                                 <AvatarImage
                                    src={selectedUser.avatarUrl}
                                    alt={selectedUser.name}
                                 />
                                 <AvatarFallback>
                                    {selectedUser.name.charAt(0)}
                                 </AvatarFallback>
                              </Avatar>
                              <span className="text-xs hidden md:inline">
                                 {selectedUser.name}
                              </span>
                           </>
                        );
                     }
                     return null;
                  })()}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-48 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Set lead..." />
                  <CommandList>
                     <CommandEmpty>No user found.</CommandEmpty>
                     <CommandGroup>
                        {usersData.map((user) => (
                           <CommandItem
                              key={user.id}
                              value={user.id}
                              onSelect={handleLeadChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Avatar className="size-5">
                                    <AvatarImage
                                       src={user.avatarUrl}
                                       alt={user.name}
                                    />
                                    <AvatarFallback>
                                       {user.name.charAt(0)}
                                    </AvatarFallback>
                                 </Avatar>
                                 <span className="text-xs">{user.name}</span>
                              </div>
                              {value === user.id && (
                                 <CheckIcon size={14} className="ml-auto" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}

interface PrioritySelectorComponentProps {
   priority: Priority;
   onPriorityChange?: (priorityId: string) => void;
}

function PrioritySelectorComponent({
   priority,
   onPriorityChange,
}: PrioritySelectorComponentProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(priority.id);

   const handlePriorityChange = (priorityId: string) => {
      setValue(priorityId);
      setOpen(false);

      if (onPriorityChange) {
         onPriorityChange(priorityId);
      }
   };

   return (
      <div>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="icon"
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
               >
                  {(() => {
                     const selectedItem = prioritiesData.find(
                        (item) => item.id === value,
                     );
                     if (selectedItem) {
                        const Icon = selectedItem.icon;
                        return <Icon className="text-muted-foreground size-4" />;
                     }
                     return null;
                  })()}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-48 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Set priority..." />
                  <CommandList>
                     <CommandEmpty>No priority found.</CommandEmpty>
                     <CommandGroup>
                        {prioritiesData.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handlePriorityChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <item.icon className="text-muted-foreground size-4" />
                                 <span className="text-xs">{item.name}</span>
                              </div>
                              {value === item.id && (
                                 <CheckIcon size={14} className="ml-auto" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}

interface HealthPopoverComponentProps {
   project: Project;
}

function HealthPopoverComponent({ project }: HealthPopoverComponentProps) {
   const getHealthIcon = (healthId: string) => {
      switch (healthId) {
         case 'on-track':
            return <CircleCheck className="size-4 text-green-500" />;
         case 'off-track':
            return <CircleX className="size-4 text-red-500" />;
         case 'at-risk':
            return <AlertCircle className="size-4 text-amber-500" />;
         case 'no-update':
         default:
            return <HelpCircle className="size-4 text-muted-foreground" />;
      }
   };

   const isMobile = useIsMobile();

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               className="flex items-center justify-center gap-1 h-7 px-2"
               size="sm"
               variant="ghost"
            >
               {getHealthIcon(project.health.id)}
               <span className="text-xs mt-[1px] ml-0.5 hidden xl:inline">
                  {project.health.name}
               </span>
            </Button>
         </PopoverTrigger>
         <PopoverContent
            side={isMobile ? 'bottom' : 'left'}
            className={cn('p-0 w-[480px]', isMobile ? 'w-full' : '')}
         >
            <div className="flex items-center justify-between border-b p-3">
               <div className="flex items-center gap-2">
                  {project.icon && (
                     <project.icon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <h4 className="font-medium text-sm">{project.name}</h4>
               </div>
               <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                     Subscribe
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     className="h-7 px-2 text-xs flex items-center gap-1"
                  >
                     <Bell className="size-3" />
                     New update
                  </Button>
               </div>
            </div>
            <div className="p-3 space-y-3">
               <div className="flex items-center justify-start gap-3">
                  <div className="flex items-center gap-2">
                     {getHealthIcon(project.health.id)}
                     <span className="text-sm">{project.health.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <Avatar className="size-5">
                        <AvatarImage
                           src={project.lead.avatarUrl}
                           alt={project.lead.name}
                        />
                        <AvatarFallback>
                           {project.lead.name.charAt(0)}
                        </AvatarFallback>
                     </Avatar>
                     <span className="text-xs text-muted-foreground">
                        {project.lead.name}
                     </span>
                     <span className="text-xs text-muted-foreground">·</span>
                     <span className="text-xs text-muted-foreground">
                        {new Date(project.startDate).toLocaleDateString()}
                     </span>
                  </div>
               </div>

               <div>
                  <p className="text-sm text-muted-foreground">
                     {project.health.description}
                  </p>
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}

interface ProjectLineComponentProps {
   project: Project;
}

function ProjectLineComponent({ project }: ProjectLineComponentProps) {
   return (
      <div className="flex items-center py-3 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm transition-colors duration-300">
         <div className="flex-grow flex items-center gap-2 overflow-hidden min-w-[200px]">
            <div className="relative">
               <div className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                  <project.icon className="size-4" />
               </div>
            </div>
            <div className="flex flex-col items-start overflow-hidden">
               <span className="font-medium truncate w-full">{project.name}</span>
            </div>
         </div>

         <div className="w-[120px] shrink-0">
            <HealthPopoverComponent project={project} />
         </div>

         <div className="w-[80px] shrink-0">
            <PrioritySelectorComponent priority={project.priority} />
         </div>
         <div className="w-[150px] shrink-0">
            <LeadSelectorComponent lead={project.lead} />
         </div>

         <div className="w-[150px] shrink-0">
            <DatePickerComponent
               date={project.startDate ? new Date(project.startDate) : undefined}
            />
         </div>

         <div className="w-[100px] shrink-0">
            <StatusWithPercentComponent
               status={project.status}
               percentComplete={project.percentComplete}
            />
         </div>
      </div>
   );
}

export default function component() {
   return (
      <div className="w-full h-full bg-white dark:bg-black text-black dark:text-white transition-colors duration-300 border rounded-lg overflow-auto">
         <div className="min-w-[850px]">
            <div className="bg-white dark:bg-black px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
               <div className="flex-grow">Title</div>
               <div className="w-[120px] shrink-0 pl-2.5">Health</div>
               <div className="w-[80px] shrink-0 pl-2">Priority</div>
               <div className="w-[150px] shrink-0 pl-2">Lead</div>
               <div className="w-[150px] shrink-0 pl-2.5">Target date</div>
               <div className="w-[100px] shrink-0 pl-2">Status</div>
            </div>

            <div>
               {projectsData.map((project) => (
                  <ProjectLineComponent key={project.id} project={project} />
               ))}
            </div>
         </div>
      </div>
   );
}
