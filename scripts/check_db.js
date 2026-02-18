const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://wwmaeyyxxocgxrbeuujn.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3bWFleXl4eG9jZ3hyYmV1dWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTg5NzEsImV4cCI6MjA4NTEzNDk3MX0.wW2WemX2BJwui2garvd-xlVRkuxn6pCWHl3l0rwqpU0'
);

async function checkDatabase() {
    console.log('--- DB CHECK START ---');
    try {
        // Check Entries
        const { data: entries, error: entriesError, count } = await supabase
            .from('trade_journal')
            .select('*', { count: 'exact' });

        if (entriesError) {
            console.error('Error fetching entries:', entriesError);
        } else {
            console.log(`Total Entries in Cloud: ${count}`);
            if (entries && entries.length > 0) {
                console.log('Latest 5 entries:');
                entries.slice(-5).forEach(e => {
                    console.log(`- ${e.entry_date} ${e.symbol} (${e.result}) [User: ${e.user_id}]`);
                });
            }
        }

        // Check Setups
        const { data: setups, error: setupsError } = await supabase
            .from('trade_setups')
            .select('*');

        if (setupsError) {
            console.error('Error fetching setups:', setupsError);
        } else {
            console.log(`Total Setups in Cloud: ${setups?.length || 0}`);
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
    console.log('--- DB CHECK END ---');
}

checkDatabase();
