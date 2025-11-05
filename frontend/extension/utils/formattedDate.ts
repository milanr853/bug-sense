export function getFormattedDate() {
    const d = new Date();
    const day = d.getDate();
    // Function to get "st", "nd", "rd", "th"
    const nth = (d: number) => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    };
    const dayStr = day + nth(day);
    const monthStr = d.toLocaleDateString('en-US', { month: 'short' });
    const yearStr = d.getFullYear();
    let hour = d.getHours();
    const ampm = hour >= 12 ? 'Pm' : 'Am';
    hour = hour % 12;
    hour = hour ? hour : 12; // the hour '0' should be '12'
    const minStr = d.getMinutes().toString().padStart(2, '0');

    // Returns "4th Nov 2025 | 12.16 Pm"
    return `${dayStr} ${monthStr} ${yearStr} | ${hour}.${minStr} ${ampm}`;
}