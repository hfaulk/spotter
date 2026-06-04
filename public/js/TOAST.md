# Toast Notification System

A clean, modern toast notification system for Spotter that replaces browser alerts with beautiful, non-blocking notifications.

## Usage

The toast system is globally available as `window.toast` after including `toast.js`. Include it in your template before your other scripts:

```html
<script src="/js/toast.js"></script>
```

## API

### `toast.success(message, duration)`
Shows a success notification with a checkmark icon.
- `message` (string): The message to display
- `duration` (number): Auto-dismiss time in ms. Default: 4000ms. Set to 0 to persist until manually closed.

```javascript
toast.success("Profile updated successfully!");
```

### `toast.error(message, duration)`
Shows an error notification with an X icon.
- `message` (string): The error message to display
- `duration` (number): Auto-dismiss time in ms. Default: 5000ms

```javascript
toast.error("Failed to save changes. Please try again.");
```

### `toast.warning(message, duration)`
Shows a warning notification with a warning triangle icon.
- `message` (string): The warning message to display
- `duration` (number): Auto-dismiss time in ms. Default: 4000ms

```javascript
toast.warning("This action cannot be undone.");
```

### `toast.info(message, duration)`
Shows an info notification with an info circle icon.
- `message` (string): The info message to display
- `duration` (number): Auto-dismiss time in ms. Default: 4000ms

```javascript
toast.info("Location services are being accessed...");
```

## Features

- ✅ Non-blocking notifications (don't interrupt user flow)
- ✅ Multiple notifications can be stacked
- ✅ Auto-dismiss with customizable duration
- ✅ Manual close button on each notification
- ✅ Smooth animations (slide in from right)
- ✅ Responsive design (full width on mobile)
- ✅ Prevents XSS via HTML escaping
- ✅ Supports 4 notification types: success, error, warning, info

## Styling

The toast styling is defined in `public/css/style.css` under the `/* ===== TOAST NOTIFICATIONS ===== */` section. Notifications:
- Stack vertically in the top-right corner
- Have a colored left border matching the notification type
- Include appropriate SVG icons
- Have a close button (X)
- Slide in from the right with 0.3s animation
- Are responsive and full-width on screens smaller than 640px

## Examples

```javascript
// Form submission
async function saveForm() {
  try {
    const res = await fetch("/api/save", { method: "POST" });
    if (res.ok) {
      toast.success("Saved successfully!");
    } else {
      toast.error("Failed to save. Please try again.");
    }
  } catch (err) {
    toast.error("Network error. Please check your connection.");
  }
}

// Validation
function validateEmail(email) {
  if (!email.includes("@")) {
    toast.warning("Please enter a valid email address.");
    return false;
  }
  return true;
}

// Status updates
function deleteItem(id) {
  toast.info("Deleting...");
  fetch(`/api/items/${id}`, { method: "DELETE" })
    .then(() => toast.success("Item deleted!"))
    .catch(() => toast.error("Failed to delete item."));
}
```
